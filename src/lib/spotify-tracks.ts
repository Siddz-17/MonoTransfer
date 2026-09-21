import { prisma } from "./prisma";
import { getValidAccessToken } from "./session";
import { Provider } from "@prisma/client";

export interface NormalizedTrack {
  playlistId: string;
  spotifyTrackId: string;
  title: string;
  artist: string;
  album: string | null;
  durationMs: number;
  isExplicit: boolean;
  position: number;
  isrc?: string | null;
}

/**
 * Normalizes Spotify track object across 2026 API changes (/items vs /tracks, item.item vs item.track)
 */
export function normalizeTrackItem(rawItem: any, idx: number, playlistDbId: string): NormalizedTrack | null {
  if (!rawItem) return null;

  // Support 2026 API format (item.item), legacy format (item.track), and bare object
  const track = rawItem.item || rawItem.track || rawItem;
  if (!track) return null;

  const title = track.name || track.title;
  if (!title || typeof title !== "string") return null;

  // Parse artists
  let artist = "Unknown Artist";
  if (Array.isArray(track.artists) && track.artists.length > 0) {
    artist = track.artists
      .map((a: any) => (typeof a === "string" ? a : a?.name || ""))
      .filter(Boolean)
      .join(", ");
  } else if (typeof track.artist === "string") {
    artist = track.artist;
  }

  // Parse album
  let album: string | null = null;
  if (typeof track.album === "string") {
    album = track.album;
  } else if (track.album?.name) {
    album = track.album.name;
  }

  const durationMs = Math.max(0, Number(track.duration_ms || track.durationMs) || 0);
  const isExplicit = Boolean(track.explicit || track.isExplicit);
  const spotifyTrackId = String(track.id || track.uri || `spotify_trk_${idx}_${Date.now()}`);
  const isrc = typeof track.external_ids?.isrc === "string" ? track.external_ids.isrc.trim().toUpperCase() : null;

  return {
    playlistId: playlistDbId,
    spotifyTrackId,
    title: title.trim().slice(0, 500),
    artist: (artist || "Unknown Artist").trim().slice(0, 500),
    album: album ? album.trim().slice(0, 500) : null,
    durationMs,
    isExplicit,
    position: idx,
    isrc,
  };
}

/**
 * Robustly fetches items from Spotify playlist with multiple endpoint fallbacks:
 * 1. /playlists/{id}/items (Spotify 2026 Web API)
 * 2. /playlists/{id}/tracks (Legacy Web API)
 * 3. /playlists/{id} (Full playlist resource fallback)
 */
async function fetchRawSpotifyItems(
  spotifyPlaylistId: string,
  token: string
): Promise<{ items: any[]; status: number; error?: string }> {
  const cleanId = spotifyPlaylistId.replace(/^spotify:playlist:/, "").trim();

  // Try /items first (Spotify's Feb 2026 endpoint)
  const candidateUrls = [
    `https://api.spotify.com/v1/playlists/${cleanId}/items?limit=100`,
    `https://api.spotify.com/v1/playlists/${cleanId}/tracks?limit=100`,
  ];

  let lastStatus = 200;
  let lastError = "";

  for (const initialUrl of candidateUrls) {
    let nextUrl: string | null = initialUrl;
    const collected: any[] = [];
    let pageCount = 0;
    let endpointSuccess = true;

    while (nextUrl && pageCount < 5) {
      pageCount++;
      try {
        const res = await fetch(nextUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        lastStatus = res.status;

        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          lastError = `Status ${res.status}: ${errBody}`;
          endpointSuccess = false;
          break;
        }

        const data: any = await res.json();
        const items = data.items || [];
        collected.push(...items);
        nextUrl = data.next || null;
      } catch (err: any) {
        lastError = err.message;
        endpointSuccess = false;
        break;
      }
    }

    if (endpointSuccess && collected.length > 0) {
      return { items: collected, status: 200 };
    }
  }

  // Fallback: full playlist endpoint
  try {
    const fullRes = await fetch(`https://api.spotify.com/v1/playlists/${cleanId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    lastStatus = fullRes.status;

    if (fullRes.ok) {
      const fullData: any = await fullRes.json();
      const items = fullData.items?.items || fullData.tracks?.items || [];
      if (items.length > 0) {
        return { items, status: 200 };
      }
    } else {
      const errBody = await fullRes.text().catch(() => "");
      lastError = `Full playlist fallback failed (${fullRes.status}): ${errBody}`;
    }
  } catch (err: any) {
    lastError = err.message;
  }

  return { items: [], status: lastStatus, error: lastError || "No tracks returned from Spotify API" };
}

/**
 * Fetches, normalizes, and caches playlist tracks in PostgreSQL.
 * Handles token refresh if Spotify returns 401.
 */
export async function syncSpotifyPlaylistTracks(
  userId: string,
  playlistDbId: string,
  spotifyPlaylistId: string,
  force = false
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    // Check if already cached and not forcing sync
    if (!force) {
      const existingCount = await prisma.playlistTrack.count({
        where: { playlistId: playlistDbId },
      });
      if (existingCount > 0) {
        return { success: true, count: existingCount };
      }
    }

    let token = await getValidAccessToken(userId, Provider.SPOTIFY);
    let result = await fetchRawSpotifyItems(spotifyPlaylistId, token);

    // If 401 Unauthorized, force refresh the token and retry once
    if (result.status === 401) {
      console.log(`[Spotify] Token 401 for user ${userId}, refreshing and retrying...`);
      token = await getValidAccessToken(userId, Provider.SPOTIFY, true);
      result = await fetchRawSpotifyItems(spotifyPlaylistId, token);
    }

    if (result.items.length === 0) {
      return {
        success: false,
        count: 0,
        error: result.error || "No songs were returned by Spotify for this playlist.",
      };
    }

    // Normalize items
    const tracksToInsert: NormalizedTrack[] = [];
    for (let i = 0; i < result.items.length; i++) {
      const parsed = normalizeTrackItem(result.items[i], i, playlistDbId);
      if (parsed) {
        tracksToInsert.push(parsed);
      }
    }

    if (tracksToInsert.length === 0) {
      return {
        success: false,
        count: 0,
        error: "Could not parse any track entries from the Spotify response.",
      };
    }

    // Atomically replace cached tracks
    await prisma.$transaction([
      prisma.playlistTrack.deleteMany({
        where: { playlistId: playlistDbId },
      }),
      prisma.playlistTrack.createMany({
        data: tracksToInsert,
      }),
      prisma.playlist.update({
        where: { id: playlistDbId },
        data: { trackCount: tracksToInsert.length },
      }),
    ]);

    return { success: true, count: tracksToInsert.length };
  } catch (err: any) {
    console.error(`[Spotify Sync] Error syncing tracks for playlist ${playlistDbId}:`, err);
    return { success: false, count: 0, error: err.message };
  }
}

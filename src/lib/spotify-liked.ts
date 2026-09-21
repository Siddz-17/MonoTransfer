import { prisma } from "./prisma";
import { getValidAccessToken } from "./session";
import { Provider } from "@prisma/client";
import { normalizeTrackItem, NormalizedTrack } from "./spotify-tracks";

export const LIKED_SONGS_SPOTIFY_ID = "liked_songs";

/**
 * Ingests user's Liked Songs (/me/tracks) from Spotify API.
 * Creates or updates a designated Playlist record with spotifyId="liked_songs".
 */
export async function syncSpotifyLikedSongs(
  userId: string,
  force = false
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    // Find or create the Liked Songs playlist container
    let playlist = await prisma.playlist.findUnique({
      where: {
        userId_spotifyId: {
          userId,
          spotifyId: LIKED_SONGS_SPOTIFY_ID,
        },
      },
    });

    if (!playlist) {
      playlist = await prisma.playlist.create({
        data: {
          userId,
          spotifyId: LIKED_SONGS_SPOTIFY_ID,
          name: "Liked Songs",
          description: "Your saved tracks from Spotify library",
          trackCount: 0,
        },
      });
    }

    // Check if already cached and not forcing
    if (!force) {
      const existingCount = await prisma.playlistTrack.count({
        where: { playlistId: playlist.id },
      });
      if (existingCount > 0) {
        return { success: true, count: existingCount };
      }
    }

    let token = await getValidAccessToken(userId, Provider.SPOTIFY);
    const allItems: any[] = [];
    let nextUrl: string | null = "https://api.spotify.com/v1/me/tracks?limit=50";
    let pagesFetched = 0;
    let totalFromApi = 0;

    while (nextUrl && pagesFetched < 10) {
      pagesFetched++;
      try {
        let res = await fetch(nextUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });

        // Token expired? Force refresh once
        if (res.status === 401) {
          token = await getValidAccessToken(userId, Provider.SPOTIFY, true);
          res = await fetch(nextUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });
        }

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          console.warn(`[LikedSongs] /me/tracks page error (${res.status}): ${errText}`);
          break;
        }

        const data: any = await res.json();
        if (pagesFetched === 1) {
          totalFromApi = Number(data.total) || 0;
        }

        const items = data.items || [];
        allItems.push(...items);
        nextUrl = data.next || null;
      } catch (err: any) {
        console.warn("[LikedSongs] Fetch iteration error:", err.message);
        break;
      }
    }

    if (allItems.length === 0) {
      return {
        success: true,
        count: 0,
      };
    }

    const tracksToInsert: NormalizedTrack[] = [];
    for (let i = 0; i < allItems.length; i++) {
      const parsed = normalizeTrackItem(allItems[i], i, playlist.id);
      if (parsed) {
        tracksToInsert.push(parsed);
      }
    }

    // Atomically replace cached tracks
    await prisma.$transaction([
      prisma.playlistTrack.deleteMany({
        where: { playlistId: playlist.id },
      }),
      prisma.playlistTrack.createMany({
        data: tracksToInsert,
      }),
      prisma.playlist.update({
        where: { id: playlist.id },
        data: { trackCount: totalFromApi || tracksToInsert.length },
      }),
    ]);

    return { success: true, count: tracksToInsert.length };
  } catch (err: any) {
    console.error("[LikedSongs] Sync failed:", err);
    return { success: false, count: 0, error: err.message };
  }
}

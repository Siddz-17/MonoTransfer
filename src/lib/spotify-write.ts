import { diceCoefficient, normalizeArtist, normalizeTitle } from "./matcher/similarity";

export interface SpotifyMatchedTrack {
  uri: string;
  id: string;
  title: string;
  artist: string;
  confidenceScore: number;
}

/**
 * Searches Spotify for a track matching the given title and artist.
 */
export async function searchSpotifyTrack(
  title: string,
  artist: string,
  token: string
): Promise<SpotifyMatchedTrack | null> {
  const normTitle = normalizeTitle(title);
  const normArtist = normalizeArtist(artist);

  // 1. Specific field query
  const query = `track:${title} artist:${artist}`.trim();
  const searchUrls = [
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=5`,
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(`${artist} ${title}`)}&type=track&limit=5`,
  ];

  for (const url of searchUrls) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) continue;

      const data: any = await res.json();
      const items = data.tracks?.items || [];
      if (items.length === 0) continue;

      let bestCandidate: SpotifyMatchedTrack | null = null;
      let highestScore = 0;

      for (const item of items) {
        const itemTitle = normalizeTitle(item.name || "");
        const itemArtists = (item.artists || []).map((a: any) => normalizeArtist(a.name || ""));
        const titleScore = diceCoefficient(normTitle, itemTitle);

        let artistScore = 0.4;
        for (const a of itemArtists) {
          if (a === normArtist || a.includes(normArtist) || normArtist.includes(a)) {
            artistScore = 1.0;
            break;
          }
          artistScore = Math.max(artistScore, diceCoefficient(normArtist, a));
        }

        const score = titleScore * 0.6 + artistScore * 0.4;
        if (score > highestScore && score >= 0.65) {
          highestScore = score;
          bestCandidate = {
            uri: item.uri,
            id: item.id,
            title: item.name,
            artist: (item.artists || []).map((a: any) => a.name).join(", "),
            confidenceScore: Math.round(score * 100) / 100,
          };
        }
      }

      if (bestCandidate) {
        return bestCandidate;
      }
    } catch (err: any) {
      console.warn("[SpotifyWrite] Search error:", err.message);
    }
  }

  return null;
}

/**
 * Creates a new playlist in the user's Spotify account.
 */
export async function createSpotifyPlaylist(
  name: string,
  description: string,
  isPublic: boolean,
  token: string
): Promise<{ id: string; name: string; url: string }> {
  const res = await fetch("https://api.spotify.com/v1/me/playlists", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: name || "Migrated from YouTube Music",
      description: description || "Migrated via MonoTransfer",
      public: isPublic,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Spotify playlist creation failed (${res.status}): ${errText}`);
  }

  const data: any = await res.json();
  return {
    id: data.id,
    name: data.name,
    url: data.external_urls?.spotify || `https://open.spotify.com/playlist/${data.id}`,
  };
}

/**
 * Adds track URIs in batches of up to 100 to a Spotify playlist.
 */
export async function addTracksToSpotifyPlaylist(
  playlistId: string,
  trackUris: string[],
  token: string
): Promise<void> {
  const batchSize = 100;
  for (let i = 0; i < trackUris.length; i += batchSize) {
    const batch = trackUris.slice(i, i + batchSize);
    const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris: batch }),
    });

    if (!res.ok) {
      console.warn(`[SpotifyWrite] Batch insertion error (${res.status}) on playlist ${playlistId}`);
    }
  }
}

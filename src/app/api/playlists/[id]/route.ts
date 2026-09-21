import { NextRequest, NextResponse } from "next/server";
import { requireSession, getValidAccessToken } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { handleRouteError } from "@/lib/api-handler";
import { Provider } from "@prisma/client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const forceSync = searchParams.get("sync") === "true";

    let playlist = await prisma.playlist.findFirst({
      where: {
        OR: [
          { id, userId: session.userId },
          { spotifyId: id, userId: session.userId },
        ],
      },
      include: {
        tracks: {
          orderBy: { position: "asc" },
        },
      },
    });

    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    let syncError: string | null = null;

    // Sync tracks from Spotify if tracks are empty or forceSync is true
    if ((playlist.tracks.length === 0 || forceSync) && playlist.spotifyId) {
      const playlistDbId = playlist.id;
      try {
        const token = await getValidAccessToken(session.userId, Provider.SPOTIFY);
        const allItems: any[] = [];
        let nextUrl: string | null = `https://api.spotify.com/v1/playlists/${playlist.spotifyId}/tracks?limit=100`;
        let pagesFetched = 0;

        // Fetch tracks with pagination (up to 500 tracks)
        while (nextUrl && pagesFetched < 5) {
          pagesFetched++;
          const pageRes: Response = await fetch(nextUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (!pageRes.ok) {
            const errText = await pageRes.text();
            console.warn(`[Playlists] Spotify /tracks page error (${pageRes.status}): ${errText}`);
            if (pagesFetched === 1) {
              // Try fallback: full playlist endpoint
              const fullRes: Response = await fetch(`https://api.spotify.com/v1/playlists/${playlist.spotifyId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (fullRes.ok) {
                const fullData: any = await fullRes.json();
                const fallbackItems = fullData.tracks?.items || [];
                allItems.push(...fallbackItems);
              } else {
                syncError = `Spotify API returned ${pageRes.status}: ${errText}`;
              }
            }
            break;
          }

          const pageData: any = await pageRes.json();
          const items = pageData.items || [];
          allItems.push(...items);
          nextUrl = pageData.next;
        }

        if (allItems.length > 0) {
          const tracksData: Array<{
            playlistId: string;
            spotifyTrackId: string;
            title: string;
            artist: string;
            album: string | null;
            durationMs: number;
            isExplicit: boolean;
            position: number;
          }> = [];

          for (let idx = 0; idx < allItems.length; idx++) {
            const item = allItems[idx];
            const track = item?.track || item;
            if (!track || (!track.name && !track.title)) continue;

            const artists = Array.isArray(track.artists)
              ? track.artists
                  .map((a: any) => (typeof a === "string" ? a : a?.name || ""))
                  .filter(Boolean)
                  .join(", ")
              : track.artist || "Unknown Artist";

            tracksData.push({
              playlistId: playlistDbId,
              spotifyTrackId: track.id || `spotify_trk_${idx}_${Date.now()}`,
              title: String(track.name || track.title || "Unknown Title").slice(0, 500),
              artist: String(artists || "Unknown Artist").slice(0, 500),
              album: track.album?.name ? String(track.album.name).slice(0, 500) : null,
              durationMs: Math.max(0, Number(track.duration_ms) || 0),
              isExplicit: Boolean(track.explicit),
              position: idx,
            });
          }

          if (tracksData.length > 0) {
            // Clear existing cached tracks to prevent duplicates
            await prisma.playlistTrack.deleteMany({
              where: { playlistId: playlistDbId },
            });

            await prisma.playlistTrack.createMany({
              data: tracksData,
            });

            // Update playlist trackCount
            await prisma.playlist.update({
              where: { id: playlistDbId },
              data: { trackCount: tracksData.length },
            });

            // Reload playlist with fresh tracks
            playlist = await prisma.playlist.findFirst({
              where: { id: playlistDbId },
              include: {
                tracks: { orderBy: { position: "asc" } },
              },
            });
          }
        }
      } catch (err: any) {
        console.error(`[Playlists] Track sync failed:`, err);
        syncError = err.message;
      }
    }

    return NextResponse.json({ playlist, syncError });
  } catch (error) {
    return handleRouteError(error);
  }
}

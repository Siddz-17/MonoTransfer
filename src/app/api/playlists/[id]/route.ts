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

    let playlist = await prisma.playlist.findFirst({
      where: {
        id,
        userId: session.userId,
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

    // Lazy sync tracks if cached tracks are empty and spotifyId is present
    if (playlist.tracks.length === 0 && playlist.spotifyId) {
      const playlistDbId = playlist.id;
      try {
        const token = await getValidAccessToken(session.userId, Provider.SPOTIFY);
        const res = await fetch(`https://api.spotify.com/v1/playlists/${playlist.spotifyId}/tracks?limit=100`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          const items = data.items || [];
          const tracksData = items
            .map((item: any, idx: number) => {
              const track = item.track;
              if (!track) return null;
              return {
                playlistId: playlistDbId,
                spotifyTrackId: track.id || `custom_${idx}`,
                title: track.name || "Unknown Title",
                artist: track.artists?.map((a: any) => a.name).join(", ") || "Unknown Artist",
                album: track.album?.name || null,
                durationMs: track.duration_ms || 0,
                isExplicit: Boolean(track.explicit),
                position: idx,
              };
            })
            .filter(Boolean);

          if (tracksData.length > 0) {
            await prisma.playlistTrack.createMany({
              data: tracksData,
            });

            // Reload playlist with fresh tracks
            playlist = await prisma.playlist.findFirst({
              where: { id: playlist.id },
              include: {
                tracks: { orderBy: { position: "asc" } },
              },
            });
          }
        }
      } catch (err: any) {
        console.warn(`[Playlists] Lazy track sync skipped: ${err.message}`);
      }
    }

    return NextResponse.json({ playlist });
  } catch (error) {
    return handleRouteError(error);
  }
}

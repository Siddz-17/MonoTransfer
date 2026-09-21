import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { handleRouteError } from "@/lib/api-handler";
import { syncSpotifyPlaylistTracks } from "@/lib/spotify-tracks";
import { syncSpotifyLikedSongs } from "@/lib/spotify-liked";

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

    if (!playlist && id === "liked_songs") {
      await syncSpotifyLikedSongs(session.userId, true);
      playlist = await prisma.playlist.findFirst({
        where: { spotifyId: "liked_songs", userId: session.userId },
        include: { tracks: { orderBy: { position: "asc" } } },
      });
    }

    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    let syncError: string | null = null;

    // Sync tracks from Spotify if tracks are empty or forceSync is true
    if ((playlist.tracks.length === 0 || forceSync) && playlist.spotifyId) {
      const syncResult = playlist.spotifyId === "liked_songs"
        ? await syncSpotifyLikedSongs(session.userId, forceSync)
        : await syncSpotifyPlaylistTracks(
            session.userId,
            playlist.id,
            playlist.spotifyId,
            forceSync
          );

      if (syncResult.success) {
        playlist = await prisma.playlist.findFirst({
          where: { id: playlist.id },
          include: {
            tracks: { orderBy: { position: "asc" } },
          },
        });
      } else {
        syncError = syncResult.error || "Failed to retrieve tracks from Spotify";
      }
    }

    return NextResponse.json({ playlist, syncError });
  } catch (error) {
    return handleRouteError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { handleRouteError } from "@/lib/api-handler";
import { enqueueTransferJob } from "@/server/queue";
import { TransferMode, TransferStatus, ItemStatus, AuditAction } from "@prisma/client";
import { syncSpotifyPlaylistTracks } from "@/lib/spotify-tracks";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, Math.min(50, parseInt(searchParams.get("limit") || "10", 10)));

    const [total, transfers] = await Promise.all([
      prisma.transfer.count({ where: { userId: session.userId } }),
      prisma.transfer.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          sourcePlaylist: {
            select: {
              name: true,
              imageUrl: true,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      transfers,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = await request.json();

    const {
      sourcePlaylistId,
      targetPlaylistName,
      targetPlaylistId,
      direction = "SPOTIFY_TO_YTMUSIC",
      mode = "NEW",
      skipDuplicates = true,
      retryFailedMatches = true,
      matchExplicitVersions = true,
      matchLiveVersions = false,
      privatePlaylist = true,
      minimumConfidenceThreshold = 0.72,
    } = body;

    if (!sourcePlaylistId) {
      return NextResponse.json({ error: "sourcePlaylistId is required" }, { status: 400 });
    }

    // Handle Bi-Directional Transfer: YouTube Music -> Spotify
    if (direction === "YTMUSIC_TO_SPOTIFY") {
      let ytTracks: any[] = [];
      try {
        const origin = new URL(request.url).origin;
        const ytTracksRes = await fetch(`${origin}/api/youtube/playlists/${sourcePlaylistId}/tracks`, {
          headers: { Cookie: request.headers.get("cookie") || "" },
        });
        if (ytTracksRes.ok) {
          const data = await ytTracksRes.json();
          ytTracks = data.tracks || [];
        }
      } catch (err: any) {
        console.warn("[Transfers] Failed fetching YouTube playlist tracks:", err.message);
      }

      if (ytTracks.length === 0) {
        return NextResponse.json(
          { error: "Could not retrieve any tracks for this YouTube Music playlist." },
          { status: 400 }
        );
      }

      const finalTargetName = targetPlaylistName?.trim() || "Migrated from YouTube Music";

      const transfer = await prisma.transfer.create({
        data: {
          userId: session.userId,
          targetPlaylistName: finalTargetName,
          targetPlaylistId: mode === "EXISTING" ? targetPlaylistId : null,
          direction: "YTMUSIC_TO_SPOTIFY",
          mode: mode === "EXISTING" ? TransferMode.EXISTING : TransferMode.NEW,
          skipDuplicates: Boolean(skipDuplicates),
          retryFailedMatches: Boolean(retryFailedMatches),
          matchExplicitVersions: Boolean(matchExplicitVersions),
          matchLiveVersions: Boolean(matchLiveVersions),
          privatePlaylist: Boolean(privatePlaylist),
          minimumConfidenceThreshold: Number(minimumConfidenceThreshold) || 0.72,
          status: TransferStatus.PENDING,
          totalTracks: ytTracks.length,
          items: {
            create: ytTracks.map((t: any) => ({
              sourceTrackId: t.videoId,
              title: t.title,
              artist: t.artist,
              durationMs: 0,
              isExplicit: false,
              status: ItemStatus.PENDING,
            })),
          },
        },
      });

      try {
        await enqueueTransferJob(transfer.id);
      } catch (err: any) {
        console.warn("[Queue] Enqueue notice:", err.message);
      }

      return NextResponse.json({ transferId: transfer.id, success: true });
    }

    // Direction: Spotify -> YouTube Music
    let playlist = await prisma.playlist.findFirst({
      where: {
        OR: [
          { id: sourcePlaylistId, userId: session.userId },
          { spotifyId: sourcePlaylistId, userId: session.userId },
        ],
      },
      include: {
        tracks: { orderBy: { position: "asc" } },
      },
    });

    if (!playlist) {
      return NextResponse.json({ error: "Source playlist not found" }, { status: 404 });
    }

    let tracks = playlist.tracks;

    // If tracks are not cached yet, sync them on-the-fly
    if (tracks.length === 0 && playlist.spotifyId) {
      const syncResult = await syncSpotifyPlaylistTracks(
        session.userId,
        playlist.id,
        playlist.spotifyId,
        false
      );
      if (syncResult.success) {
        tracks = await prisma.playlistTrack.findMany({
          where: { playlistId: playlist.id },
          orderBy: { position: "asc" },
        });
      }
    }

    if (tracks.length === 0) {
      return NextResponse.json(
        { error: "Could not retrieve any tracks for this playlist from Spotify." },
        { status: 400 }
      );
    }

    const finalTargetName = targetPlaylistName?.trim() || playlist.name;

    // Create Transfer record
    const transfer = await prisma.transfer.create({
      data: {
        userId: session.userId,
        sourcePlaylistId: playlist.id,
        targetPlaylistId: mode === "EXISTING" ? targetPlaylistId : null,
        targetPlaylistName: finalTargetName,
        mode: mode === "EXISTING" ? TransferMode.EXISTING : TransferMode.NEW,
        skipDuplicates: Boolean(skipDuplicates),
        retryFailedMatches: Boolean(retryFailedMatches),
        matchExplicitVersions: Boolean(matchExplicitVersions),
        matchLiveVersions: Boolean(matchLiveVersions),
        privatePlaylist: Boolean(privatePlaylist),
        minimumConfidenceThreshold: Number(minimumConfidenceThreshold) || 0.72,
        status: TransferStatus.PENDING,
        totalTracks: tracks.length,
        items: {
          create: tracks.map((track) => ({
            sourceTrackId: track.spotifyTrackId,
            title: track.title,
            artist: track.artist,
            album: track.album,
            durationMs: track.durationMs,
            isExplicit: track.isExplicit,
            isrc: track.isrc || null,
            status: ItemStatus.PENDING,
          })),
        },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: AuditAction.TRANSFER_CREATED,
        metadata: JSON.stringify({ transferId: transfer.id, playlistId: playlist.id, trackCount: playlist.tracks.length }),
      },
    });

    // Enqueue job in BullMQ
    try {
      await enqueueTransferJob(transfer.id);
    } catch (err: any) {
      console.warn("[Queue] BullMQ enqueue notice (Redis might be offline or connecting):", err.message);
    }

    return NextResponse.json({ transferId: transfer.id, success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

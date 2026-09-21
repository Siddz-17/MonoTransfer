import { NextRequest, NextResponse } from "next/server";
import { requireSession, getValidAccessToken } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { handleRouteError } from "@/lib/api-handler";
import { enqueueTransferJob } from "@/server/queue";
import { TransferMode, TransferStatus, ItemStatus, AuditAction, Provider } from "@prisma/client";

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

    const playlist = await prisma.playlist.findFirst({
      where: { id: sourcePlaylistId, userId: session.userId },
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
      try {
        const token = await getValidAccessToken(session.userId, Provider.SPOTIFY);
        const res = await fetch(`https://api.spotify.com/v1/playlists/${playlist.spotifyId}/tracks?limit=100`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: any = await res.json();
          const items = data.items || [];
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

          for (let idx = 0; idx < items.length; idx++) {
            const item = items[idx];
            const track = item?.track || item;
            if (!track || (!track.name && !track.title)) continue;
            const artists = Array.isArray(track.artists)
              ? track.artists.map((a: any) => (typeof a === "string" ? a : a?.name || "")).filter(Boolean).join(", ")
              : track.artist || "Unknown Artist";

            tracksData.push({
              playlistId: playlist.id,
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
            await prisma.playlistTrack.createMany({ data: tracksData });
            tracks = await prisma.playlistTrack.findMany({
              where: { playlistId: playlist.id },
              orderBy: { position: "asc" },
            });
          }
        }
      } catch (err: any) {
        console.warn("[Transfers] Auto-sync tracks on transfer failed:", err.message);
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

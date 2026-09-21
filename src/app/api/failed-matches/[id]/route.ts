import { NextRequest, NextResponse } from "next/server";
import { requireSession, getValidAccessToken } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { handleRouteError } from "@/lib/api-handler";
import { gatherCandidates } from "@/lib/matcher/search";
import { evaluateCandidates } from "@/lib/matcher/scoring";
import { ItemStatus, AuditAction, Provider } from "@prisma/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = await request.json();
    const { action, videoId, title, artist, customQuery } = body;

    const failedMatch = await prisma.failedMatch.findUnique({
      where: { id },
      include: {
        transfer: true,
        transferItem: true,
      },
    });

    if (!failedMatch || failedMatch.transfer.userId !== session.userId) {
      return NextResponse.json({ error: "Failed match record not found" }, { status: 404 });
    }

    if (action === "manual_select") {
      if (!videoId) {
        return NextResponse.json({ error: "videoId is required for manual selection" }, { status: 400 });
      }

      // Update TransferItem
      await prisma.transferItem.update({
        where: { id: failedMatch.transferItemId },
        data: {
          status: ItemStatus.MANUAL,
          targetVideoId: videoId,
          targetTitle: title || failedMatch.title,
          targetArtist: artist || failedMatch.artist,
          resolvedAt: new Date(),
        },
      });

      // Update FailedMatch
      await prisma.failedMatch.update({
        where: { id },
        data: {
          resolved: true,
          resolvedVideoId: videoId,
          resolvedTitle: title || failedMatch.title,
        },
      });

      // Adjust transfer counts
      await prisma.transfer.update({
        where: { id: failedMatch.transferId },
        data: {
          failedCount: { decrement: 1 },
          matchedCount: { increment: 1 },
        },
      });

      // Attempt to insert into YouTube playlist if user is connected to Google
      try {
        const googleToken = await getValidAccessToken(session.userId, Provider.GOOGLE);
        if (googleToken && failedMatch.transfer.targetPlaylistId) {
          await fetch("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${googleToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              snippet: {
                playlistId: failedMatch.transfer.targetPlaylistId,
                resourceId: {
                  kind: "youtube#video",
                  videoId,
                },
              },
            }),
          });
        }
      } catch (err: any) {
        console.warn("[FailedMatch] Manual playlist insert skipped:", err.message);
      }

      await prisma.auditLog.create({
        data: {
          userId: session.userId,
          action: AuditAction.MANUAL_OVERRIDE,
          metadata: JSON.stringify({ failedMatchId: id, videoId, title }),
        },
      });

      return NextResponse.json({ success: true, message: "Track matched manually" });
    }

    if (action === "skip") {
      await prisma.transferItem.update({
        where: { id: failedMatch.transferItemId },
        data: {
          status: ItemStatus.SKIPPED,
          resolvedAt: new Date(),
        },
      });

      await prisma.failedMatch.update({
        where: { id },
        data: {
          resolved: true,
        },
      });

      await prisma.transfer.update({
        where: { id: failedMatch.transferId },
        data: {
          failedCount: { decrement: 1 },
          skippedCount: { increment: 1 },
        },
      });

      return NextResponse.json({ success: true, message: "Track skipped" });
    }

    if (action === "search_again") {
      const queryToSearch = customQuery || `${failedMatch.artist} ${failedMatch.title}`;
      const candidates = await gatherCandidates({
        title: queryToSearch,
        artist: failedMatch.artist,
        album: failedMatch.album,
        durationMs: failedMatch.durationMs,
        isExplicit: failedMatch.isExplicit,
      });

      const evaluated = evaluateCandidates(
        {
          title: failedMatch.title,
          artist: failedMatch.artist,
          album: failedMatch.album,
          durationMs: failedMatch.durationMs,
          isExplicit: failedMatch.isExplicit,
        },
        candidates,
        {
          matchLiveVersions: failedMatch.transfer.matchLiveVersions,
          matchExplicitVersions: failedMatch.transfer.matchExplicitVersions,
          minimumConfidenceThreshold: 0.50,
        }
      );

      // Update suggested candidates in FailedMatch
      await prisma.failedMatch.update({
        where: { id },
        data: {
          suggestedCandidatesJson: JSON.stringify(evaluated.topCandidates),
        },
      });

      return NextResponse.json({
        success: true,
        suggestions: evaluated.topCandidates,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return handleRouteError(error);
  }
}

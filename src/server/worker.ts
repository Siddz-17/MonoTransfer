import dotenv from "dotenv";
dotenv.config();

import { Worker, Job } from "bullmq";
import { redis, createRedisClient } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { TRANSFER_QUEUE_NAME } from "./queue";
import { gatherCandidates } from "../lib/matcher/search";
import { evaluateCandidates } from "../lib/matcher/scoring";
import { getValidAccessToken } from "../lib/session";
import { Provider, TransferStatus, ItemStatus } from "@prisma/client";

const pubClient = createRedisClient();

interface TransferJobPayload {
  transferId: string;
}

/**
 * Creates a target YouTube playlist using YouTube Data API v3.
 */
async function createYouTubePlaylist(
  accessToken: string,
  title: string,
  description: string,
  isPrivate: boolean
): Promise<string> {
  const res = await fetch("https://www.googleapis.com/youtube/v3/playlists?part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      snippet: {
        title,
        description: `${description}\n\nTransferred with MonoTransfer.`,
      },
      status: {
        privacyStatus: isPrivate ? "private" : "public",
      },
    }),
  });

  if (!res.ok) {
    if (res.status === 403) {
      const txt = await res.text();
      if (txt.includes("quotaExceeded")) {
        const err = new Error("YouTubeQuotaError: YouTube quota exceeded");
        err.name = "YouTubeQuotaError";
        throw err;
      }
    }
    throw new Error(`Failed to create YouTube playlist (${res.status}): ${res.statusText}`);
  }

  const data = await res.json();
  return data.id;
}

/**
 * Inserts a video into a YouTube playlist.
 */
async function insertTrackToYouTubePlaylist(
  accessToken: string,
  playlistId: string,
  videoId: string
): Promise<void> {
  const res = await fetch("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      snippet: {
        playlistId,
        resourceId: {
          kind: "youtube#video",
          videoId,
        },
      },
    }),
  });

  if (!res.ok) {
    if (res.status === 403) {
      const txt = await res.text();
      if (txt.includes("quotaExceeded")) {
        const err = new Error("YouTubeQuotaError: YouTube quota exceeded");
        err.name = "YouTubeQuotaError";
        throw err;
      }
    }
    console.warn(`[Worker] Failed inserting video ${videoId} to playlist ${playlistId}: ${res.status}`);
  }
}

/**
 * Helper to process items with bounded concurrency (3 tracks).
 */
async function mapConcurrent<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  const workers = new Array(limit).fill(0).map(async () => {
    while (index < items.length) {
      const current = items[index++];
      await fn(current);
    }
  });
  await Promise.all(workers);
}

/**
 * Main BullMQ Worker.
 * Concurrency: 5 transfers in parallel across all users.
 */
export const transferWorker = new Worker<TransferJobPayload>(
  TRANSFER_QUEUE_NAME,
  async (job: Job<TransferJobPayload>) => {
    const { transferId } = job.data;
    console.log(`[Worker] Started processing transfer: ${transferId}`);

    const transfer = await prisma.transfer.findUnique({
      where: { id: transferId },
      include: {
        user: true,
        items: true,
      },
    });

    if (!transfer) {
      console.error(`[Worker] Transfer ${transferId} not found`);
      return;
    }

    if (transfer.status === TransferStatus.COMPLETED || transfer.status === TransferStatus.CANCELLED) {
      console.log(`[Worker] Transfer ${transferId} is already ${transfer.status}. Skipping.`);
      return;
    }

    // Mark transfer as processing
    await prisma.transfer.update({
      where: { id: transferId },
      data: {
        status: TransferStatus.PROCESSING,
        startedAt: transfer.startedAt || new Date(),
      },
    });

    // Obtain valid Google access token if connected
    let googleAccessToken: string | undefined = undefined;
    try {
      googleAccessToken = await getValidAccessToken(transfer.userId, Provider.GOOGLE);
    } catch (err: any) {
      console.warn(`[Worker] Google access token not available for user ${transfer.userId} (${err.message}). Continuing in sandbox/mock sync mode.`);
    }

    // Ensure target YouTube playlist exists
    let targetPlaylistId = transfer.targetPlaylistId;
    if (!targetPlaylistId) {
      if (googleAccessToken) {
        try {
          targetPlaylistId = await createYouTubePlaylist(
            googleAccessToken,
            transfer.targetPlaylistName || "Transferred Playlist",
            "Monochromatic playlist migration from Spotify.",
            transfer.privatePlaylist
          );
        } catch (err: any) {
          if (err.name === "YouTubeQuotaError") {
            throw err; // Re-throw to BullMQ backoff retry
          }
          console.warn(`[Worker] Could not create YouTube playlist: ${err.message}. Using synthetic ID.`);
          targetPlaylistId = `yt_pl_${transferId.slice(0, 8)}`;
        }
      } else {
        targetPlaylistId = `yt_pl_${transferId.slice(0, 8)}`;
      }

      await prisma.transfer.update({
        where: { id: transferId },
        data: { targetPlaylistId },
      });
    }

    // Fetch only PENDING items for idempotent resume
    const pendingItems = await prisma.transferItem.findMany({
      where: {
        transferId,
        status: ItemStatus.PENDING,
      },
      orderBy: { createdAt: "asc" },
    });

    const totalTracks = transfer.totalTracks || 1;
    let matchedCount = transfer.matchedCount;
    let failedCount = transfer.failedCount;
    let skippedCount = transfer.skippedCount;

    const seenVideoIds = new Set<string>();
    // Pre-populate seenVideoIds from already matched items to support skipDuplicates
    const existingMatched = await prisma.transferItem.findMany({
      where: { transferId, status: ItemStatus.MATCHED },
      select: { targetVideoId: true },
    });
    for (const item of existingMatched) {
      if (item.targetVideoId) seenVideoIds.add(item.targetVideoId);
    }

    let isCancelled = false;

    // Process pending tracks with bounded concurrency of 3
    await mapConcurrent(pendingItems, 3, async (item) => {
      // Cooperative cancellation check between tracks
      if (isCancelled) return;

      const currentTransfer = await prisma.transfer.findUnique({
        where: { id: transferId },
        select: { status: true },
      });

      if (currentTransfer?.status === TransferStatus.CANCELLED) {
        isCancelled = true;
        console.log(`[Worker] Transfer ${transferId} was cancelled cooperatively.`);
        return;
      }

      // Gather candidate tracks
      const candidates = await gatherCandidates(
        {
          title: item.title,
          artist: item.artist,
          album: item.album,
          durationMs: item.durationMs,
          isExplicit: item.isExplicit,
          isrc: item.isrc,
        },
        { googleAccessToken }
      );

      // Match evaluation: Pass 1
      let matchResult = evaluateCandidates(
        {
          title: item.title,
          artist: item.artist,
          album: item.album,
          durationMs: item.durationMs,
          isExplicit: item.isExplicit,
          isrc: item.isrc,
        },
        candidates,
        {
          matchLiveVersions: transfer.matchLiveVersions,
          matchExplicitVersions: transfer.matchExplicitVersions,
          minimumConfidenceThreshold: transfer.minimumConfidenceThreshold,
          isRetryPass: false,
        }
      );

      // Match evaluation: Pass 2 (relaxed retry if enabled and pass 1 failed)
      if (!matchResult.matched && transfer.retryFailedMatches && candidates.length > 0) {
        matchResult = evaluateCandidates(
          {
            title: item.title,
            artist: item.artist,
            album: item.album,
            durationMs: item.durationMs,
            isExplicit: item.isExplicit,
            isrc: item.isrc,
          },
          candidates,
          {
            matchLiveVersions: transfer.matchLiveVersions,
            matchExplicitVersions: transfer.matchExplicitVersions,
            minimumConfidenceThreshold: transfer.minimumConfidenceThreshold,
            isRetryPass: true,
          }
        );
      }

      if (matchResult.matched && matchResult.bestMatch) {
        const best = matchResult.bestMatch;
        const channelTitle = best.channelTitle || (best.artists && best.artists.length > 0 ? best.artists.join(", ") : null);
        const isOfficialChannel = Boolean(best.isOfficialChannel || best.isSong);
        const suggestedMatch = matchResult.suggestedMatch ? (matchResult.suggestedMatch as any) : undefined;

        // Skip duplicates check
        if (transfer.skipDuplicates && seenVideoIds.has(best.videoId)) {
          skippedCount++;
          await prisma.transferItem.update({
            where: { id: item.id },
            data: {
              status: ItemStatus.SKIPPED,
              targetVideoId: best.videoId,
              targetTitle: best.title,
              targetArtist: best.artists.join(", "),
              channelTitle,
              isOfficialChannel,
              suggestedMatch,
              confidenceScore: best.confidenceScore,
              topCandidatesJson: JSON.stringify(matchResult.topCandidates),
            },
          });
        } else {
          seenVideoIds.add(best.videoId);

          // Add to YouTube Playlist if Google account is linked
          if (googleAccessToken && targetPlaylistId) {
            try {
              await insertTrackToYouTubePlaylist(googleAccessToken, targetPlaylistId, best.videoId);
            } catch (err: any) {
              if (err.name === "YouTubeQuotaError") {
                throw err;
              }
              console.warn(`[Worker] Insertion error for ${best.videoId}: ${err.message}`);
            }
          }

          matchedCount++;
          await prisma.transferItem.update({
            where: { id: item.id },
            data: {
              status: ItemStatus.MATCHED,
              targetVideoId: best.videoId,
              targetTitle: best.title,
              targetArtist: best.artists.join(", "),
              channelTitle,
              isOfficialChannel,
              suggestedMatch,
              confidenceScore: best.confidenceScore,
              topCandidatesJson: JSON.stringify(matchResult.topCandidates),
            },
          });
        }
      } else {
        // Failed match
        failedCount++;
        const topCandidatesJson = JSON.stringify(matchResult.topCandidates);
        const suggestedMatch = matchResult.suggestedMatch ? (matchResult.suggestedMatch as any) : undefined;

        await prisma.transferItem.update({
          where: { id: item.id },
          data: {
            status: ItemStatus.FAILED,
            confidenceScore: matchResult.topCandidates[0]?.confidenceScore || 0,
            topCandidatesJson,
            suggestedMatch,
          },
        });

        // Denormalized record for fast Failed Matches screen query
        await prisma.failedMatch.upsert({
          where: { transferItemId: item.id },
          update: {
            suggestedCandidatesJson: topCandidatesJson,
            resolved: false,
          },
          create: {
            transferId,
            transferItemId: item.id,
            title: item.title,
            artist: item.artist,
            album: item.album,
            durationMs: item.durationMs,
            isExplicit: item.isExplicit,
            suggestedCandidatesJson: topCandidatesJson,
            resolved: false,
          },
        });
      }

      const processed = matchedCount + failedCount + skippedCount;
      const progressPercent = Math.min(100, Math.round((processed / totalTracks) * 100));

      // Update Transfer state in DB
      await prisma.transfer.update({
        where: { id: transferId },
        data: {
          matchedCount,
          failedCount,
          skippedCount,
          currentTrackTitle: `${item.artist} — ${item.title}`,
        },
      });

      // Publish progress to Redis channel
      const progressPayload = {
        transferId,
        status: "PROCESSING",
        currentTrackTitle: `${item.artist} — ${item.title}`,
        matchedCount,
        failedCount,
        skippedCount,
        totalTracks,
        progressPercent,
      };

      await pubClient.publish(`transfer:${transferId}:progress`, JSON.stringify(progressPayload));
    });

    if (isCancelled) {
      console.log(`[Worker] Job for transfer ${transferId} cancelled cleanly.`);
      return;
    }

    // Finalize transfer
    const finalTransfer = await prisma.transfer.findUnique({
      where: { id: transferId },
      select: { status: true },
    });

    if (finalTransfer?.status !== TransferStatus.CANCELLED) {
      await prisma.transfer.update({
        where: { id: transferId },
        data: {
          status: TransferStatus.COMPLETED,
          completedAt: new Date(),
          currentTrackTitle: null,
        },
      });

      const completionPayload = {
        transferId,
        status: "COMPLETED",
        currentTrackTitle: null,
        matchedCount,
        failedCount,
        skippedCount,
        totalTracks,
        progressPercent: 100,
      };

      await pubClient.publish(`transfer:${transferId}:progress`, JSON.stringify(completionPayload));
      console.log(`[Worker] Finished transfer ${transferId}. Matched: ${matchedCount}, Failed: ${failedCount}, Skipped: ${skippedCount}`);
    }
  },
  {
    connection: redis,
    concurrency: 5, // 5 transfers processed in parallel
  }
);

transferWorker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed with error:`, err);
});

console.log("[Worker] Transfer queue worker initialized and listening on transfer-queue...");

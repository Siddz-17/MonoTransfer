import dotenv from "dotenv";
dotenv.config();

import { Worker, Job } from "bullmq";
import { redis, createRedisClient } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { TRANSFER_QUEUE_NAME } from "./queue";
import { gatherCandidates, warmupYtMusicService } from "../lib/matcher/search";
import { evaluateCandidates } from "../lib/matcher/scoring";
import { getValidAccessToken } from "../lib/session";
import { Provider, TransferStatus, ItemStatus } from "@prisma/client";
import { createSpotifyPlaylist, searchSpotifyTrack, addTracksToSpotifyPlaylist } from "../lib/spotify-write";

const pubClient = createRedisClient();

async function broadcastProgress(transferId: string, payload: any): Promise<void> {
  try {
    await pubClient.publish(`transfer:${transferId}:progress`, JSON.stringify(payload));
  } catch (err: any) {
    console.warn(`[Worker] Failed publishing progress for ${transferId}:`, err.message);
  }
}

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
    const txt = await res.text().catch(() => "");
    if (res.status === 403 && txt.includes("quotaExceeded")) {
      const err = new Error("YouTubeQuotaError: YouTube quota exceeded");
      err.name = "YouTubeQuotaError";
      throw err;
    }
    if (txt.includes("youtubeSignupRequired") || txt.includes("channelNotFound")) {
      const err = new Error("YOUTUBE_CHANNEL_REQUIRED: Your Google account does not have a YouTube Channel handle created yet. Please visit youtube.com to complete the one-time channel setup, then retry.");
      err.name = "YouTubeChannelRequired";
      throw err;
    }
    throw new Error(`Failed to create YouTube playlist (${res.status}): ${txt || res.statusText}`);
  }

  const data = await res.json();
  return data.id;
}

let playlistWriteLock: Promise<void> = Promise.resolve();

/**
 * Serializes writes to YouTube Music playlist with safe delay to eliminate 409 Conflict collisions.
 */
function queueYouTubePlaylistInsert<T>(operation: () => Promise<T>): Promise<T> {
  const next = playlistWriteLock.then(async () => {
    // 750ms spacing between YouTube writes prevents 409 SERVICE_UNAVAILABLE / ABORTED conflicts
    await new Promise((resolve) => setTimeout(resolve, 750));
    return operation();
  });
  playlistWriteLock = next.then(
    () => {},
    () => {}
  );
  return next;
}

interface InsertResult {
  success: boolean;
  insertedVideoId?: string;
  error?: string;
}

/**
 * Inserts candidate into YouTube playlist with auto-retry, backoff, and candidate fallback.
 */
async function insertCandidateToPlaylist(
  userId: string,
  playlistId: string,
  candidates: Array<{ videoId: string; title?: string }>,
  getCurrentToken: () => string,
  onTokenRefresh: (newToken: string) => void
): Promise<InsertResult> {
  let token = getCurrentToken();

  for (const candidate of candidates) {
    // Guard: skip synthetic/mock video IDs — they always 404 on YouTube API
    if (!candidate.videoId || candidate.videoId.startsWith("yt_mock_")) {
      console.warn(`[Worker] Skipping mock/invalid videoId: ${candidate.videoId}`);
      continue;
    }

    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const res = await fetch("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            snippet: {
              playlistId,
              resourceId: {
                kind: "youtube#video",
                videoId: candidate.videoId,
              },
            },
          }),
        });

        if (res.ok) {
          return { success: true, insertedVideoId: candidate.videoId };
        }

        const errText = await res.text().catch(() => "");
        console.warn(`[Worker] Insert attempt ${attempts}/${maxAttempts} for ${candidate.videoId} (${res.status}): ${errText}`);

        if (res.status === 401) {
          // Token expired, refresh and retry
          try {
            token = await getValidAccessToken(userId, Provider.GOOGLE, true);
            onTokenRefresh(token);
            continue;
          } catch (tokErr: any) {
            console.error("[Worker] Token refresh failed:", tokErr.message);
            return { success: false, error: "Google token expired and refresh failed" };
          }
        }

        if (res.status === 403 && errText.includes("quotaExceeded")) {
          const err = new Error("YouTubeQuotaError: YouTube quota exceeded");
          err.name = "YouTubeQuotaError";
          throw err;
        }

        if (res.status === 409 || res.status === 429 || res.status >= 500) {
          // Resource conflict (YouTube ABORTED/SERVICE_UNAVAILABLE) or rate limit:
          // Retry with exponential backoff (1s, 2s, 4s, 8s)
          const backoffMs = Math.min(8000, 1000 * Math.pow(2, attempts - 1));
          console.log(`[Worker] 409/429 conflict encountered. Retrying attempt ${attempts + 1} in ${backoffMs}ms...`);
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }

        // 400 or 404 (e.g. video unavailable, region blocked, age-gated): try next candidate
        break;
      } catch (err: any) {
        if (err.name === "YouTubeQuotaError") throw err;
        console.warn(`[Worker] Insert network error on ${candidate.videoId}:`, err.message);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  return { success: false, error: "Could not insert any candidate into YouTube playlist" };
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
    console.log(`[Worker] ytmusic-service URL: ${process.env.YTMUSIC_SERVICE_URL || "(not set, defaulting to http://localhost:8000)"}`);

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

    // -------------------------------------------------------------
    // Bi-Directional: YouTube Music -> Spotify
    // -------------------------------------------------------------
    if (transfer.direction === "YTMUSIC_TO_SPOTIFY") {
      let spotifyToken = "";
      try {
        spotifyToken = await getValidAccessToken(transfer.userId, Provider.SPOTIFY);
      } catch (err: any) {
        console.warn(`[Worker] Spotify token not available: ${err.message}`);
      }

      let targetSpotifyId = transfer.targetPlaylistId;
      if (!targetSpotifyId && spotifyToken) {
        try {
          const spPl = await createSpotifyPlaylist(
            transfer.targetPlaylistName || "Migrated from YouTube Music",
            "Migrated via MonoTransfer",
            !transfer.privatePlaylist,
            spotifyToken
          );
          targetSpotifyId = spPl.id;
          await prisma.transfer.update({
            where: { id: transferId },
            data: { targetPlaylistId: targetSpotifyId },
          });
        } catch (err: any) {
          console.warn("[Worker] Could not create Spotify target playlist:", err.message);
        }
      }

      const pendingItems = await prisma.transferItem.findMany({
        where: { transferId, status: ItemStatus.PENDING },
        orderBy: { createdAt: "asc" },
      });

      const totalTracks = transfer.totalTracks || 1;
      let matchedCount = transfer.matchedCount;
      let failedCount = transfer.failedCount;
      let skippedCount = transfer.skippedCount;
      const matchedUris: string[] = [];

      for (const item of pendingItems) {
        const progressPercent = Math.min(100, Math.round(((matchedCount + failedCount + skippedCount) / totalTracks) * 100));
        await broadcastProgress(transferId, {
          transferId,
          status: TransferStatus.PROCESSING,
          matchedCount,
          failedCount,
          skippedCount,
          totalTracks,
          progressPercent,
          currentTrackTitle: `${item.artist} - ${item.title}`,
        });

        let matched = false;
        if (spotifyToken) {
          try {
            const match = await searchSpotifyTrack(item.title, item.artist, spotifyToken);
            if (match) {
              matched = true;
              matchedUris.push(match.uri);
              matchedCount++;
              await prisma.transferItem.update({
                where: { id: item.id },
                data: {
                  status: ItemStatus.MATCHED,
                  targetVideoId: match.id,
                  targetTitle: match.title,
                  targetArtist: match.artist,
                  confidenceScore: match.confidenceScore,
                },
              });
            }
          } catch (err: any) {
            console.warn("[Worker] Spotify track search error:", err.message);
          }
        }

        if (!matched) {
          failedCount++;
          await prisma.transferItem.update({
            where: { id: item.id },
            data: {
              status: ItemStatus.FAILED,
              confidenceScore: 0,
            },
          });
        }
      }

      // Add all matched URIs to Spotify playlist
      if (spotifyToken && targetSpotifyId && matchedUris.length > 0) {
        await addTracksToSpotifyPlaylist(targetSpotifyId, matchedUris, spotifyToken);
      }

      // Mark transfer complete
      await prisma.transfer.update({
        where: { id: transferId },
        data: {
          status: TransferStatus.COMPLETED,
          matchedCount,
          failedCount,
          skippedCount,
          completedAt: new Date(),
        },
      });

      await broadcastProgress(transferId, {
        transferId,
        status: TransferStatus.COMPLETED,
        matchedCount,
        failedCount,
        skippedCount,
        totalTracks,
        progressPercent: 100,
      });

      return;
    }

    // -------------------------------------------------------------
    // Direction: Spotify -> YouTube Music
    // -------------------------------------------------------------
    // Obtain valid Google access token
    let googleAccessToken: string | undefined = undefined;
    try {
      googleAccessToken = await getValidAccessToken(transfer.userId, Provider.GOOGLE);
    } catch (err: any) {
      console.warn(`[Worker] Google access token not available for user ${transfer.userId}:`, err.message);
    }

    if (!googleAccessToken) {
      const errMsg = "Google / YouTube Music account is not connected. Please connect Google in Settings before migrating.";
      console.error(`[Worker] Transfer ${transferId} aborted: ${errMsg}`);
      await prisma.transfer.update({
        where: { id: transferId },
        data: {
          status: TransferStatus.FAILED,
          completedAt: new Date(),
        },
      });
      await broadcastProgress(transferId, {
        transferId,
        status: TransferStatus.FAILED,
        errorMessage: errMsg,
      });
      return;
    }

    let currentGoogleToken = googleAccessToken;

    // Ensure target YouTube playlist exists
    let targetPlaylistId = transfer.targetPlaylistId;
    if (!targetPlaylistId) {
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
        console.error(`[Worker] Could not create YouTube playlist: ${err.message}`);
        await prisma.transfer.update({
          where: { id: transferId },
          data: {
            status: TransferStatus.FAILED,
            completedAt: new Date(),
          },
        });
        await broadcastProgress(transferId, {
          transferId,
          status: TransferStatus.FAILED,
          errorMessage: err.message,
        });
        return;
      }

      await prisma.transfer.update({
        where: { id: transferId },
        data: { targetPlaylistId },
      });
    }

    // Warm up the ytmusic-service before processing (handles Render free-tier cold starts).
    await warmupYtMusicService();

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
        const candidateList = [
          best,
          ...matchResult.topCandidates.filter((c: any) => c.videoId !== best.videoId),
        ];

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
          // Serialized insertion with auto-retry on 409/429 and fallback to next candidate on 400/404
          const insertRes = await queueYouTubePlaylistInsert(() =>
            insertCandidateToPlaylist(
              transfer.userId,
              targetPlaylistId,
              candidateList,
              () => currentGoogleToken,
              (newToken) => { currentGoogleToken = newToken; }
            )
          );

          if (insertRes.success && insertRes.insertedVideoId) {
            seenVideoIds.add(insertRes.insertedVideoId);
            matchedCount++;
            await prisma.transferItem.update({
              where: { id: item.id },
              data: {
                status: ItemStatus.MATCHED,
                targetVideoId: insertRes.insertedVideoId,
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
            failedCount++;
            await prisma.transferItem.update({
              where: { id: item.id },
              data: {
                status: ItemStatus.FAILED,
                confidenceScore: 0,
                topCandidatesJson: JSON.stringify(matchResult.topCandidates),
              },
            });
            await prisma.failedMatch.upsert({
              where: { transferItemId: item.id },
              update: {
                suggestedCandidatesJson: JSON.stringify(matchResult.topCandidates),
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
                suggestedCandidatesJson: JSON.stringify(matchResult.topCandidates),
                resolved: false,
              },
            });
          }
        }
      } else {
        // Did not clear strict threshold — auto-approve highest matching candidate
        // while preserving record in review list so user can check/swap later if required!
        const candidateList = matchResult.topCandidates;

        if (candidateList.length > 0) {
          const autoCandidate = candidateList[0];
          const autoChannelTitle = autoCandidate.channelTitle || (autoCandidate.artists && autoCandidate.artists.length > 0 ? autoCandidate.artists.join(", ") : null);
          const autoIsOfficial = Boolean(autoCandidate.isOfficialChannel || autoCandidate.isSong);
          const topCandidatesJson = JSON.stringify(matchResult.topCandidates);
          const suggestedMatch = matchResult.suggestedMatch ? (matchResult.suggestedMatch as any) : undefined;

          // Serialized insertion with auto-retry and candidate fallback
          const insertRes = await queueYouTubePlaylistInsert(() =>
            insertCandidateToPlaylist(
              transfer.userId,
              targetPlaylistId,
              candidateList,
              () => currentGoogleToken,
              (newToken) => { currentGoogleToken = newToken; }
            )
          );

          if (insertRes.success && insertRes.insertedVideoId) {
            seenVideoIds.add(insertRes.insertedVideoId);
            matchedCount++;
            await prisma.transferItem.update({
              where: { id: item.id },
              data: {
                status: ItemStatus.MATCHED,
                targetVideoId: insertRes.insertedVideoId,
                targetTitle: autoCandidate.title,
                targetArtist: autoCandidate.artists.join(", "),
                channelTitle: autoChannelTitle,
                isOfficialChannel: autoIsOfficial,
                suggestedMatch,
                confidenceScore: autoCandidate.confidenceScore,
                topCandidatesJson,
              },
            });

            // Keep in review list so user can inspect or change later
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
          } else {
            failedCount++;
            await prisma.transferItem.update({
              where: { id: item.id },
              data: {
                status: ItemStatus.FAILED,
                confidenceScore: 0,
                topCandidatesJson,
              },
            });
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
        } else {
          // Zero candidates found
          failedCount++;
          await prisma.transferItem.update({
            where: { id: item.id },
            data: {
              status: ItemStatus.FAILED,
              confidenceScore: 0,
              topCandidatesJson: "[]",
            },
          });
        }
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

import dotenv from "dotenv";
dotenv.config();

import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import url from "url";
import { verifyWsToken } from "../lib/session";
import { prisma } from "../lib/prisma";
import { createRedisClient } from "../lib/redis";

const PORT = parseInt(process.env.WS_PORT || "3001", 10);
const server = http.createServer();
const wss = new WebSocketServer({ noServer: true });

// Map of transferId -> Set of active WebSockets
const subscribers = new Map<string, Set<WebSocket>>();
// Map of transferId -> dedicated Redis subscriber client
const redisSubscribers = new Map<string, any>();

async function ensureRedisSubscription(transferId: string) {
  if (redisSubscribers.has(transferId)) return;

  const sub = createRedisClient();
  const channel = `transfer:${transferId}:progress`;
  await sub.subscribe(channel);

  sub.on("message", (chan, message) => {
    if (chan === channel) {
      const clients = subscribers.get(transferId);
      if (clients) {
        for (const ws of clients) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
          }
        }
      }
    }
  });

  redisSubscribers.set(transferId, sub);
}

server.on("upgrade", async (request, socket, head) => {
  const parsedUrl = url.parse(request.url || "", true);
  const transferId = parsedUrl.query.transferId as string;
  const token = parsedUrl.query.token as string;

  if (!transferId || !token) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  // Verify short-lived scoped JWT
  const verified = verifyWsToken(token);
  if (!verified || (verified.transferId && verified.transferId !== transferId)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }

  // Verify transfer belongs to user
  const transfer = await prisma.transfer.findUnique({
    where: { id: transferId },
    select: { userId: true },
  });

  if (!transfer || transfer.userId !== verified.userId) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request, transferId);
  });
});

wss.on("connection", async (ws: WebSocket, req: any, transferId: string) => {
  console.log(`[WS] Client connected for transfer: ${transferId}`);

  if (!subscribers.has(transferId)) {
    subscribers.set(transferId, new Set());
  }
  subscribers.get(transferId)!.add(ws);

  await ensureRedisSubscription(transferId);

  // Send immediate state snapshot so late-joining client sees data without delay
  try {
    const current = await prisma.transfer.findUnique({
      where: { id: transferId },
      select: {
        id: true,
        status: true,
        currentTrackTitle: true,
        matchedCount: true,
        failedCount: true,
        skippedCount: true,
        totalTracks: true,
      },
    });

    if (current && ws.readyState === WebSocket.OPEN) {
      const processed = current.matchedCount + current.failedCount + current.skippedCount;
      const progressPercent = current.totalTracks > 0
        ? Math.min(100, Math.round((processed / current.totalTracks) * 100))
        : 0;

      ws.send(
        JSON.stringify({
          transferId: current.id,
          status: current.status,
          currentTrackTitle: current.currentTrackTitle,
          matchedCount: current.matchedCount,
          failedCount: current.failedCount,
          skippedCount: current.skippedCount,
          totalTracks: current.totalTracks,
          progressPercent,
          isSnapshot: true,
        })
      );
    }
  } catch (err: any) {
    console.error("[WS] Snapshot send error:", err.message);
  }

  ws.on("close", () => {
    console.log(`[WS] Client disconnected for transfer: ${transferId}`);
    const clientSet = subscribers.get(transferId);
    if (clientSet) {
      clientSet.delete(ws);
      if (clientSet.size === 0) {
        subscribers.delete(transferId);
        const sub = redisSubscribers.get(transferId);
        if (sub) {
          sub.unsubscribe(`transfer:${transferId}:progress`).catch(() => {});
          sub.quit().catch(() => {});
          redisSubscribers.delete(transferId);
        }
      }
    }
  });

  ws.on("error", (err) => {
    console.error(`[WS] Socket error for transfer ${transferId}:`, err);
  });
});

server.listen(PORT, () => {
  console.log(`[WS] Standalone WebSocket server running on port ${PORT}`);
});

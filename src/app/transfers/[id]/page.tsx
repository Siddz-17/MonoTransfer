"use client";

import { useEffect, useState, useRef, use } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { TransferProgress } from "@/components/TransferProgress";
import { TransferResult } from "@/components/TransferResult";
import { LoadingState } from "@/components/LoadingState";
import { ArrowLeft, Radio } from "lucide-react";

export default function TransferProgressPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [transfer, setTransfer] = useState<any>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Initial load
  const loadTransfer = async () => {
    try {
      const res = await fetch(`/api/transfers/${id}`);
      if (res.ok) {
        const data = await res.json();
        setTransfer(data.transfer);
      }
    } catch (err) {
      console.error("Failed to load transfer:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransfer();
  }, [id]);

  // WebSocket Connection
  useEffect(() => {
    if (!id || !transfer || transfer.status === "COMPLETED" || transfer.status === "CANCELLED") {
      return;
    }

    let socket: WebSocket | null = null;
    let isSubscribed = true;

    async function initWs() {
      try {
        const tokenRes = await fetch(`/api/auth/ws-token?transferId=${id}`);
        if (!tokenRes.ok) return;
        const { wsUrl } = await tokenRes.json();

        socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
          if (isSubscribed) setWsConnected(true);
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (isSubscribed) {
              setTransfer((prev: any) => ({
                ...prev,
                ...data,
                progressPercent: data.progressPercent ?? prev?.progressPercent ?? 0,
              }));
            }
          } catch (e) {
            console.error("WS Parse error:", e);
          }
        };

        socket.onerror = () => {
          if (isSubscribed) setWsConnected(false);
        };

        socket.onclose = () => {
          if (isSubscribed) setWsConnected(false);
        };
      } catch (err) {
        console.warn("WebSocket init failed:", err);
      }
    }

    initWs();

    // Fallback polling interval every 2.5s
    const pollInterval = setInterval(() => {
      loadTransfer();
    }, 2500);

    return () => {
      isSubscribed = false;
      clearInterval(pollInterval);
      if (socket) {
        socket.close();
      }
    };
  }, [id, transfer?.status]);

  const handleCancel = async () => {
    if (!id) return;
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/transfers/${id}/cancel`, { method: "POST" });
      if (res.ok) {
        setTransfer((prev: any) => ({ ...prev, status: "CANCELLED" }));
      }
    } catch (err) {
      console.error("Cancel failed:", err);
    } finally {
      setIsCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <LoadingState label="CONNECTING TO MIGRATION PIPELINE..." />
      </div>
    );
  }

  if (!transfer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground font-mono">
        <div className="text-center space-y-4">
          <p className="text-secondary text-xs uppercase">TRANSFER NOT FOUND.</p>
          <Link href="/transfers" className="underline text-xs">RETURN TO TRANSFERS</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between p-6 md:p-12 relative selection:bg-foreground selection:text-background">
      {/* Top Bar Navigation */}
      <header className="flex items-center justify-between border-b border-border pb-6 font-mono text-xs">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-secondary hover:text-foreground tracking-widest uppercase transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>EXIT TO DASHBOARD</span>
        </Link>

        <div className="flex items-center gap-4">
          <span className="text-secondary uppercase tracking-widest hidden sm:inline">
            TARGET: <span className="text-foreground font-semibold">{transfer.targetPlaylistName}</span>
          </span>
          <span className="border border-border px-2.5 py-1 text-[10px] uppercase font-bold tracking-widest">
            ID: {transfer.id.slice(0, 10)}
          </span>
        </div>
      </header>

      {/* Main Focus Area */}
      <main className="my-auto py-8">
        {transfer.status === "COMPLETED" ? (
          <TransferResult
            transferId={transfer.id}
            targetPlaylistName={transfer.targetPlaylistName}
            targetPlaylistId={transfer.targetPlaylistId}
            matchedCount={transfer.matchedCount}
            failedCount={transfer.failedCount}
            skippedCount={transfer.skippedCount}
            totalTracks={transfer.totalTracks}
          />
        ) : (
          <TransferProgress
            percentage={transfer.progressPercent || 0}
            currentTrackTitle={transfer.currentTrackTitle}
            matchedCount={transfer.matchedCount || 0}
            failedCount={transfer.failedCount || 0}
            skippedCount={transfer.skippedCount || 0}
            totalTracks={transfer.totalTracks || 1}
            status={transfer.status}
            isWsConnected={wsConnected}
            onCancel={handleCancel}
            isCancelling={isCancelling}
          />
        )}
      </main>

      {/* Footer Industrial Coordinates */}
      <footer className="border-t border-border pt-6 flex flex-wrap items-center justify-between gap-4 font-mono text-[10px] text-secondary tracking-widest uppercase">
        <span>MONOTRANSFER // FOCUS MODE</span>
        <span>CHANNEL: transfer:{transfer.id}:progress</span>
      </footer>
    </div>
  );
}

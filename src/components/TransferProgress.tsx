"use client";

import { motion } from "framer-motion";
import { Disc, AlertCircle, XOctagon } from "lucide-react";
import { cn } from "@/lib/utils";

interface TransferProgressProps {
  percentage: number;
  currentTrackTitle?: string | null;
  matchedCount: number;
  failedCount: number;
  skippedCount: number;
  totalTracks: number;
  status: string;
  isWsConnected?: boolean;
  onCancel?: () => void;
  isCancelling?: boolean;
}

export function TransferProgress({
  percentage,
  currentTrackTitle,
  matchedCount,
  failedCount,
  skippedCount,
  totalTracks,
  status,
  isWsConnected = true,
  onCancel,
  isCancelling = false,
}: TransferProgressProps) {
  const clampedPercent = Math.min(100, Math.max(0, percentage));
  const segments = 40;
  const filledSegments = Math.round((clampedPercent / 100) * segments);

  return (
    <div className="w-full max-w-4xl mx-auto border border-border bg-background p-8 md:p-14 space-y-12">
      {/* Top Telemetry Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6 font-mono text-xs">
        <div className="flex items-center gap-3">
          <span className={cn("w-2.5 h-2.5", isWsConnected ? "bg-foreground animate-pulse" : "border border-secondary")} />
          <span className="uppercase tracking-widest text-secondary">
            STREAM: <span className="text-foreground font-semibold">{isWsConnected ? "WEBSOCKET LIVE" : "POLLING FALLBACK"}</span>
          </span>
        </div>
        <div className="flex items-center gap-6">
          <span className="text-secondary uppercase tracking-widest">
            STATE: <span className="text-foreground font-bold tracking-widest uppercase">{status}</span>
          </span>
          <span className="text-secondary uppercase tracking-widest">
            CONCURRENCY: <span className="text-foreground font-semibold">3 WORKERS</span>
          </span>
        </div>
      </div>

      {/* Hero Percentage Display */}
      <div className="text-center space-y-4">
        <div className="font-dot text-7xl md:text-9xl tracking-mega font-bold select-none text-foreground">
          {String(clampedPercent).padStart(2, "0")}%
        </div>
        <p className="font-mono text-xs tracking-mega uppercase text-secondary">
          TRANSFER IN PROGRESS // DO NOT CLOSE CONNECTION
        </p>
      </div>

      {/* Segmented Digital Progress Bar */}
      <div className="space-y-3">
        <div className="flex gap-1.5 h-6 p-1 border border-border bg-muted/20">
          {Array.from({ length: segments }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "flex-1 h-full transition-all duration-150",
                i < filledSegments
                  ? "bg-foreground"
                  : "bg-transparent border border-border/40"
              )}
            />
          ))}
        </div>
        <div className="flex justify-between font-mono text-[11px] text-secondary tracking-widest">
          <span>00%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Current Track Industrial Display */}
      <div className="border border-border p-6 bg-muted/30 flex items-center justify-between gap-6">
        <div className="flex items-center gap-4 truncate">
          <div className="w-10 h-10 border border-border flex items-center justify-center shrink-0">
            <Disc className="w-5 h-5 animate-spin" style={{ animationDuration: "3s" }} />
          </div>
          <div className="truncate">
            <span className="font-mono text-[10px] text-secondary tracking-widest uppercase block">
              CURRENTLY MATCHING
            </span>
            <p className="font-mono text-sm font-semibold truncate text-foreground mt-0.5">
              {currentTrackTitle || "INITIALIZING AUDIO FINGERPRINT MATCHER..."}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <span className="font-mono text-xs border border-border px-3 py-1 font-bold">
            {matchedCount + failedCount + skippedCount} / {totalTracks}
          </span>
        </div>
      </div>

      {/* Metrics Ticker Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="border border-border p-4 text-center">
          <span className="font-mono text-[10px] text-secondary uppercase tracking-widest block">
            MATCHED
          </span>
          <span className="font-dot text-3xl font-bold text-foreground mt-1 block">
            {matchedCount}
          </span>
        </div>
        <div className="border border-border p-4 text-center">
          <span className="font-mono text-[10px] text-secondary uppercase tracking-widest block">
            FAILED
          </span>
          <span className="font-dot text-3xl font-bold text-foreground mt-1 block">
            {failedCount}
          </span>
        </div>
        <div className="border border-border p-4 text-center">
          <span className="font-mono text-[10px] text-secondary uppercase tracking-widest block">
            SKIPPED
          </span>
          <span className="font-dot text-3xl font-bold text-foreground mt-1 block">
            {skippedCount}
          </span>
        </div>
        <div className="border border-border p-4 text-center">
          <span className="font-mono text-[10px] text-secondary uppercase tracking-widest block">
            TOTAL
          </span>
          <span className="font-dot text-3xl font-bold text-foreground mt-1 block">
            {totalTracks}
          </span>
        </div>
      </div>

      {/* Cancel Button */}
      {status === "PROCESSING" && onCancel && (
        <div className="text-center pt-4">
          <button
            onClick={onCancel}
            disabled={isCancelling}
            className="inline-flex items-center gap-2 border border-border px-6 py-2.5 text-xs font-mono tracking-widest uppercase text-secondary hover:text-foreground hover:border-foreground transition-all disabled:opacity-50"
          >
            <XOctagon className="w-4 h-4" />
            <span>{isCancelling ? "STOPPING..." : "CANCEL TRANSFER"}</span>
          </button>
        </div>
      )}
    </div>
  );
}

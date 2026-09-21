"use client";

import Link from "next/link";
import { ArrowRight, Download, Disc } from "lucide-react";
import { cn } from "@/lib/utils";

interface TransferHistoryCardProps {
  id: string;
  targetPlaylistName: string;
  sourcePlaylistName?: string | null;
  status: string;
  totalTracks: number;
  matchedCount: number;
  failedCount: number;
  createdAt: string;
  completedAt?: string | null;
}

export function TransferHistoryCard({
  id,
  targetPlaylistName,
  sourcePlaylistName,
  status,
  totalTracks,
  matchedCount,
  failedCount,
  createdAt,
  completedAt,
}: TransferHistoryCardProps) {
  const formattedDate = new Date(createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  let durationText = "—";
  if (completedAt) {
    const diffSec = Math.round((new Date(completedAt).getTime() - new Date(createdAt).getTime()) / 1000);
    durationText = `${diffSec}s`;
  }

  const isCompleted = status === "COMPLETED";
  const isFailed = status === "FAILED";
  const isProcessing = status === "PROCESSING" || status === "PENDING";

  return (
    <div className="border border-border p-5 bg-background hover:border-foreground transition-all duration-150 flex flex-col md:flex-row md:items-center justify-between gap-4 font-mono">
      <div className="space-y-1.5 min-w-0">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "px-2 py-0.5 text-[10px] uppercase font-bold tracking-widest border",
              isCompleted && "bg-foreground text-background border-foreground",
              isFailed && "border-foreground text-foreground underline",
              isProcessing && "border-secondary text-secondary animate-pulse"
            )}
          >
            {status}
          </span>
          <span className="text-secondary text-[11px]">{formattedDate}</span>
          <span className="text-secondary text-[11px]">DURATION: {durationText}</span>
        </div>

        <h3 className="font-dot text-base tracking-wider uppercase text-foreground truncate">
          {targetPlaylistName}
        </h3>

        {sourcePlaylistName && (
          <p className="text-xs text-secondary truncate">
            FROM: {sourcePlaylistName}
          </p>
        )}
      </div>

      <div className="flex items-center gap-6 shrink-0 self-end md:self-center">
        <div className="text-right text-xs">
          <span className="text-foreground font-semibold">
            {matchedCount} / {totalTracks}
          </span>
          <span className="text-secondary block text-[10px]">
            {failedCount > 0 ? `${failedCount} UNRESOLVED` : "ALL MATCHED"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={`/api/transfers/${id}/report`}
            title="Download CSV Report"
            className="p-2 border border-border hover:border-foreground text-secondary hover:text-foreground transition-colors"
          >
            <Download className="w-4 h-4" />
          </a>

          <Link
            href={`/transfers/${id}`}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-border hover:border-foreground text-xs uppercase tracking-wider font-semibold text-foreground hover:bg-hover transition-all"
          >
            <span>VIEW</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

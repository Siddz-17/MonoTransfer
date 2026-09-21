"use client";

import Link from "next/link";
import { CheckCircle2, ExternalLink, AlertTriangle, Download, RotateCcw } from "lucide-react";

interface TransferResultProps {
  transferId: string;
  targetPlaylistName: string;
  targetPlaylistId?: string | null;
  matchedCount: number;
  failedCount: number;
  skippedCount: number;
  totalTracks: number;
}

export function TransferResult({
  transferId,
  targetPlaylistName,
  targetPlaylistId,
  matchedCount,
  failedCount,
  skippedCount,
  totalTracks,
}: TransferResultProps) {
  const ytPlaylistUrl = targetPlaylistId && !targetPlaylistId.startsWith("mock_") && !targetPlaylistId.startsWith("yt_pl_")
    ? `https://music.youtube.com/playlist?list=${targetPlaylistId}`
    : `https://music.youtube.com`;

  const successRate = totalTracks > 0 ? Math.round((matchedCount / totalTracks) * 100) : 0;

  return (
    <div className="w-full max-w-3xl mx-auto border border-border bg-background p-8 md:p-14 space-y-10">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 border border-border px-3 py-1 text-xs font-mono tracking-widest uppercase">
          <span className="w-2 h-2 rounded-full bg-foreground" />
          <span>PROCESS TERMINATED</span>
        </div>
        <h2 className="font-dot text-4xl md:text-5xl tracking-widest font-bold uppercase text-foreground">
          TRANSFER COMPLETE
        </h2>
        <p className="font-mono text-xs text-secondary tracking-widest uppercase">
          PLAYLIST: {targetPlaylistName}
        </p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-4 border border-border divide-x divide-border bg-muted/20">
        <div className="p-4 text-center">
          <span className="font-mono text-[10px] text-secondary tracking-widest block uppercase">
            MATCHED
          </span>
          <span className="font-dot text-2xl font-bold text-foreground mt-1 block">
            {matchedCount}
          </span>
        </div>
        <div className="p-4 text-center">
          <span className="font-mono text-[10px] text-secondary tracking-widest block uppercase">
            FAILED
          </span>
          <span className="font-dot text-2xl font-bold text-foreground mt-1 block">
            {failedCount}
          </span>
        </div>
        <div className="p-4 text-center">
          <span className="font-mono text-[10px] text-secondary tracking-widest block uppercase">
            SKIPPED
          </span>
          <span className="font-dot text-2xl font-bold text-foreground mt-1 block">
            {skippedCount}
          </span>
        </div>
        <div className="p-4 text-center">
          <span className="font-mono text-[10px] text-secondary tracking-widest block uppercase">
            ACCURACY
          </span>
          <span className="font-dot text-2xl font-bold text-foreground mt-1 block">
            {successRate}%
          </span>
        </div>
      </div>

      {/* Action Buttons Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
        {/* Open Playlist */}
        <a
          href={ytPlaylistUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2.5 p-4 border border-foreground bg-foreground text-background hover:bg-background hover:text-foreground font-mono text-xs font-bold tracking-widest uppercase transition-all"
        >
          <ExternalLink className="w-4 h-4" />
          <span>OPEN IN YT MUSIC</span>
        </a>

        {/* View Failures */}
        <Link
          href={`/transfers/${transferId}/failures`}
          className="flex items-center justify-center gap-2.5 p-4 border border-border hover:border-foreground font-mono text-xs font-bold tracking-widest uppercase transition-all text-foreground"
        >
          <AlertTriangle className="w-4 h-4 text-secondary" />
          <span>RESOLVE FAILURES ({failedCount})</span>
        </Link>

        {/* Export Report */}
        <a
          href={`/api/transfers/${transferId}/report`}
          download
          className="flex items-center justify-center gap-2.5 p-4 border border-border hover:border-foreground font-mono text-xs tracking-widest uppercase transition-all text-secondary hover:text-foreground"
        >
          <Download className="w-4 h-4" />
          <span>EXPORT CSV REPORT</span>
        </a>

        {/* Transfer Again */}
        <Link
          href="/playlists"
          className="flex items-center justify-center gap-2.5 p-4 border border-border hover:border-foreground font-mono text-xs tracking-widest uppercase transition-all text-secondary hover:text-foreground"
        >
          <RotateCcw className="w-4 h-4" />
          <span>NEW MIGRATION</span>
        </Link>
      </div>
    </div>
  );
}

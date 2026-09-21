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
  const isSynthetic = !targetPlaylistId || targetPlaylistId.startsWith("mock_") || targetPlaylistId.startsWith("yt_pl_");
  const ytPlaylistUrl = !isSynthetic
    ? `https://music.youtube.com/playlist?list=${targetPlaylistId}`
    : `https://music.youtube.com`;

  const successRate = totalTracks > 0 ? Math.round((matchedCount / totalTracks) * 100) : 0;

  return (
    <div className="w-full max-w-3xl mx-auto border border-border bg-background p-8 md:p-14 space-y-10 font-mono">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 border border-border px-3 py-1 text-xs tracking-widest uppercase">
          <span className="w-2 h-2 rounded-full bg-foreground" />
          <span>PROCESS TERMINATED</span>
        </div>
        <h2 className="font-dot text-4xl md:text-5xl tracking-widest font-bold uppercase text-foreground">
          {isSynthetic ? "CATALOG MATCHED" : "TRANSFER COMPLETE"}
        </h2>
        <p className="text-xs text-secondary tracking-widest uppercase">
          PLAYLIST: {targetPlaylistName}
        </p>
      </div>

      {/* Synthetic / Missing Connection Warning */}
      {isSynthetic ? (
        <div className="border border-foreground p-5 bg-background text-xs space-y-3">
          <div className="flex items-center gap-2 font-bold uppercase text-foreground">
            <AlertTriangle className="w-4 h-4 text-foreground shrink-0" />
            <span>PLAYLIST NOT UPLOADED TO YOUTUBE MUSIC</span>
          </div>
          <p className="text-secondary text-[11px] leading-relaxed">
            Your songs were identified and matched against YouTube Music, but the playlist could not be created in your YouTube library because your Google / YouTube Music account is unlinked or lacked permissions.
          </p>
          <div className="pt-1">
            <a
              href="/api/auth/google"
              className="inline-flex items-center gap-2 px-4 py-2 border border-foreground bg-foreground text-background font-bold text-xs uppercase hover:bg-background hover:text-foreground transition-all"
            >
              <span>CONNECT GOOGLE / YOUTUBE MUSIC</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      ) : (
        <div className="border border-border p-4 bg-background text-xs space-y-1.5 text-center">
          <span className="text-secondary uppercase tracking-widest text-[10px] block">
            DESTINATION // YOUTUBE MUSIC PLAYLIST
          </span>
          <span className="font-bold text-foreground block text-sm">
            ID: {targetPlaylistId}
          </span>
          <p className="text-secondary text-[11px] leading-relaxed">
            Created as a private playlist under your connected YouTube account. Open <strong>YouTube Music → Library → Playlists</strong> or click the direct button below.
          </p>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-4 border border-border divide-x divide-border bg-muted/20">
        <div className="p-4 text-center">
          <span className="text-[10px] text-secondary tracking-widest block uppercase">
            MATCHED
          </span>
          <span className="font-dot text-2xl font-bold text-foreground mt-1 block">
            {matchedCount}
          </span>
        </div>
        <div className="p-4 text-center">
          <span className="text-[10px] text-secondary tracking-widest block uppercase">
            FAILED
          </span>
          <span className="font-dot text-2xl font-bold text-foreground mt-1 block">
            {failedCount}
          </span>
        </div>
        <div className="p-4 text-center">
          <span className="text-[10px] text-secondary tracking-widest block uppercase">
            SKIPPED
          </span>
          <span className="font-dot text-2xl font-bold text-foreground mt-1 block">
            {skippedCount}
          </span>
        </div>
        <div className="p-4 text-center">
          <span className="text-[10px] text-secondary tracking-widest block uppercase">
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
        {!isSynthetic ? (
          <a
            href={ytPlaylistUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2.5 p-4 border border-foreground bg-foreground text-background hover:bg-background hover:text-foreground text-xs font-bold tracking-widest uppercase transition-all"
          >
            <ExternalLink className="w-4 h-4" />
            <span>OPEN IN YT MUSIC</span>
          </a>
        ) : (
          <a
            href="/api/auth/google"
            className="flex items-center justify-center gap-2.5 p-4 border border-foreground bg-foreground text-background hover:bg-background hover:text-foreground text-xs font-bold tracking-widest uppercase transition-all"
          >
            <ExternalLink className="w-4 h-4" />
            <span>CONNECT GOOGLE TO SYNC</span>
          </a>
        )}

        {/* View Failures */}
        <Link
          href={`/transfers/${transferId}/failures`}
          className="flex items-center justify-center gap-2.5 p-4 border border-border hover:border-foreground text-xs font-bold tracking-widest uppercase transition-all text-foreground"
        >
          <AlertTriangle className="w-4 h-4 text-secondary" />
          <span>RESOLVE FAILURES ({failedCount})</span>
        </Link>

        {/* Export Report */}
        <a
          href={`/api/transfers/${transferId}/report`}
          download
          className="flex items-center justify-center gap-2.5 p-4 border border-border hover:border-foreground text-xs tracking-widest uppercase transition-all text-secondary hover:text-foreground"
        >
          <Download className="w-4 h-4" />
          <span>EXPORT CSV REPORT</span>
        </a>

        {/* Transfer Again */}
        <Link
          href="/playlists"
          className="flex items-center justify-center gap-2.5 p-4 border border-border hover:border-foreground text-xs tracking-widest uppercase transition-all text-secondary hover:text-foreground"
        >
          <RotateCcw className="w-4 h-4" />
          <span>NEW MIGRATION</span>
        </Link>
      </div>
    </div>
  );
}

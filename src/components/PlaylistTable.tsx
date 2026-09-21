"use client";

import { formatDuration } from "@/lib/utils";

export interface TrackItem {
  id: string;
  spotifyTrackId?: string;
  title: string;
  artist: string;
  album?: string | null;
  durationMs: number;
  isExplicit?: boolean;
  position?: number;
}

interface PlaylistTableProps {
  tracks: TrackItem[];
}

export function PlaylistTable({ tracks }: PlaylistTableProps) {
  if (!tracks || tracks.length === 0) {
    return (
      <div className="border border-border p-12 text-center">
        <p className="font-mono text-xs text-secondary tracking-widest uppercase">
          NO TRACKS FOUND IN PLAYLIST CACHE.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-border overflow-x-auto bg-background">
      <table className="w-full text-left border-collapse font-mono text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/30 text-secondary tracking-wider text-[11px] uppercase select-none">
            <th className="py-3 px-4 w-12 text-center">#</th>
            <th className="py-3 px-4">TRACK</th>
            <th className="py-3 px-4">ARTIST</th>
            <th className="py-3 px-4">ALBUM</th>
            <th className="py-3 px-4 w-24 text-right">TIME</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {tracks.map((track, index) => (
            <tr
              key={track.id || index}
              className="hover:bg-hover transition-colors group"
            >
              <td className="py-3.5 px-4 text-center text-secondary font-mono text-[11px]">
                {String(index + 1).padStart(2, "0")}
              </td>
              <td className="py-3.5 px-4 font-semibold text-foreground">
                <div className="flex items-center gap-2">
                  <span className="truncate">{track.title}</span>
                  {track.isExplicit && (
                    <span className="border border-secondary px-1 text-[9px] font-bold text-secondary tracking-normal">
                      E
                    </span>
                  )}
                </div>
              </td>
              <td className="py-3.5 px-4 text-secondary group-hover:text-foreground transition-colors">
                <span className="truncate">{track.artist}</span>
              </td>
              <td className="py-3.5 px-4 text-secondary truncate max-w-xs">
                {track.album || "—"}
              </td>
              <td className="py-3.5 px-4 text-right text-secondary font-mono">
                {formatDuration(track.durationMs)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

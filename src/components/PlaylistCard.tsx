"use client";

import Link from "next/link";
import { Disc3, ArrowRight } from "lucide-react";

interface PlaylistCardProps {
  id: string;
  name: string;
  description?: string | null;
  trackCount: number;
  imageUrl?: string | null;
}

export function PlaylistCard({ id, name, description, trackCount, imageUrl }: PlaylistCardProps) {
  return (
    <div className="border border-border p-6 flex flex-col justify-between hover:border-foreground transition-all duration-150 group bg-background relative">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <Link
            href={`/playlists/${id}`}
            className="w-10 h-10 border border-border flex items-center justify-center shrink-0 group-hover:border-foreground group-hover:bg-foreground group-hover:text-background transition-colors"
          >
            <Disc3 className="w-5 h-5" />
          </Link>
          <div className="text-right">
            <span className="text-xs font-mono font-bold tracking-widest uppercase border border-border px-2 py-0.5">
              {trackCount} {trackCount === 1 ? "TRACK" : "TRACKS"}
            </span>
          </div>
        </div>

        <div>
          <Link href={`/playlists/${id}`} className="block">
            <h3 className="font-dot text-base tracking-wider uppercase line-clamp-1 group-hover:tracking-widest transition-all hover:underline underline-offset-4">
              {name}
            </h3>
          </Link>
          <p className="text-xs font-mono text-secondary mt-1 line-clamp-2 leading-relaxed">
            {description || "No description provided."}
          </p>
        </div>
      </div>

      <div className="pt-6 mt-6 border-t border-border flex items-center justify-between gap-3">
        <Link
          href={`/playlists/${id}`}
          className="text-xs font-mono tracking-widest text-secondary hover:text-foreground underline underline-offset-4"
        >
          PREVIEW
        </Link>
        <Link
          href={`/transfers/new?playlistId=${id}`}
          className="inline-flex items-center gap-2 px-3.5 py-2 border border-foreground bg-foreground text-background hover:bg-background hover:text-foreground text-xs font-mono font-bold tracking-widest uppercase transition-all"
        >
          <span>TRANSFER</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

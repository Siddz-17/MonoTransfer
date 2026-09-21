"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { PlaylistTable } from "@/components/PlaylistTable";
import { LoadingState } from "@/components/LoadingState";
import { ArrowLeft, ArrowRight, Disc3 } from "lucide-react";

export default function PlaylistPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [playlist, setPlaylist] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/playlists/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.playlist) {
          setPlaylist(data.playlist);
        }
      })
      .catch((err) => console.error("Error fetching playlist:", err))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="PLAYLIST PREVIEW" subtitle="SOURCE METADATA & TRACKLIST" />

        <main className="p-8 md:p-12 space-y-8 max-w-7xl">
          {/* Back Navigation */}
          <div>
            <Link
              href="/playlists"
              className="inline-flex items-center gap-2 font-mono text-xs text-secondary hover:text-foreground tracking-widest uppercase transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>RETURN TO PLAYLISTS</span>
            </Link>
          </div>

          {loading ? (
            <LoadingState label="RETRIEVING TRACKS FROM SPOTIFY..." />
          ) : !playlist ? (
            <div className="border border-border p-12 text-center font-mono text-xs text-secondary tracking-widest uppercase">
              PLAYLIST NOT FOUND.
            </div>
          ) : (
            <>
              {/* Playlist Summary Hero */}
              <div className="border border-border p-8 bg-background flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs border border-border px-2.5 py-0.5 uppercase tracking-widest font-bold">
                      {playlist.tracks?.length || playlist.trackCount} TRACKS
                    </span>
                    <span className="font-mono text-xs text-secondary uppercase tracking-widest">
                      ID: {playlist.spotifyId}
                    </span>
                  </div>

                  <h1 className="font-dot text-3xl md:text-4xl tracking-wider uppercase font-bold text-foreground">
                    {playlist.name}
                  </h1>

                  {playlist.description && (
                    <p className="font-mono text-xs text-secondary max-w-2xl leading-relaxed">
                      {playlist.description}
                    </p>
                  )}
                </div>

                <div className="shrink-0">
                  <Link
                    href={`/transfers/new?playlistId=${playlist.id}`}
                    className="inline-flex items-center gap-3 px-6 py-3.5 border border-foreground bg-foreground text-background hover:bg-background hover:text-foreground font-mono text-xs font-bold tracking-widest uppercase transition-all"
                  >
                    <span>CONFIGURE TRANSFER</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>

              {/* Tracks Table */}
              <div className="space-y-4">
                <div className="flex items-center justify-between font-mono text-xs text-secondary tracking-widest uppercase">
                  <span>// TRACK MANIFEST</span>
                  <span>TOTAL: {playlist.tracks?.length || 0} TRACKS</span>
                </div>

                <PlaylistTable tracks={playlist.tracks || []} />
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

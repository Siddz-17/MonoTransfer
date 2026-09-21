"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { PlaylistTable } from "@/components/PlaylistTable";
import { LoadingState } from "@/components/LoadingState";
import { ArrowLeft, ArrowRight, RefreshCw, AlertCircle } from "lucide-react";

export default function PlaylistPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [playlist, setPlaylist] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchPlaylist = useCallback(async (forceSync = false) => {
    if (forceSync) setSyncing(true);
    else setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/playlists/${id}${forceSync ? "?sync=true" : ""}`);
      if (res.ok) {
        const data = await res.json();
        if (data.playlist) {
          setPlaylist(data.playlist);
        }
        if (data.syncError) {
          setErrorMsg(data.syncError);
        }
      } else {
        const errData = await res.json();
        setErrorMsg(errData.message || "Failed to load playlist.");
      }
    } catch (err: any) {
      console.error("Error fetching playlist:", err);
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchPlaylist();
    }
  }, [id, fetchPlaylist]);

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
              {/* Error Notice if any */}
              {errorMsg && (
                <div className="border border-foreground p-5 bg-background font-mono text-xs space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-foreground shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold uppercase block text-foreground">SYNC WARNING</span>
                        <span className="text-secondary leading-relaxed mt-0.5 block">{errorMsg}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => fetchPlaylist(true)}
                      className="underline hover:opacity-80 shrink-0 font-bold uppercase text-[11px]"
                    >
                      RETRY SYNC
                    </button>
                  </div>

                  {(errorMsg.includes("SPOTIFY_SCOPE_REQUIRED") ||
                    errorMsg.toLowerCase().includes("scope") ||
                    errorMsg.toLowerCase().includes("permission") ||
                    errorMsg.toLowerCase().includes("reconnect")) && (
                    <div className="pt-2 border-t border-border flex items-center justify-between">
                      <span className="text-[11px] text-secondary">
                        Click below to re-authorize Spotify with library permissions:
                      </span>
                      <a
                        href="/api/auth/spotify"
                        className="inline-flex items-center gap-2 px-4 py-2 border border-foreground bg-foreground text-background font-bold text-[11px] uppercase tracking-wider hover:bg-background hover:text-foreground transition-all"
                      >
                        <span>RECONNECT SPOTIFY NOW</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Playlist Summary Hero */}
              <div className="border border-border p-8 bg-background flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs border border-border px-2.5 py-0.5 uppercase tracking-widest font-bold">
                      {playlist.tracks?.length || 0} TRACKS LOADED
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

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => fetchPlaylist(true)}
                    disabled={syncing}
                    className="inline-flex items-center gap-2 px-4 py-3.5 border border-border hover:border-foreground font-mono text-xs font-semibold tracking-widest uppercase transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
                    <span>{syncing ? "SYNCING..." : "RE-SYNC TRACKS"}</span>
                  </button>

                  <Link
                    href={`/transfers/new?playlistId=${playlist.id}`}
                    className="inline-flex items-center gap-3 px-6 py-3.5 border border-foreground bg-foreground text-background hover:bg-background hover:text-foreground font-mono text-xs font-bold tracking-widest uppercase transition-all"
                  >
                    <span>CONFIGURE TRANSFER</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>

              {/* Tracks Manifest */}
              <div className="space-y-4">
                <div className="flex items-center justify-between font-mono text-xs text-secondary tracking-widest uppercase">
                  <span>// TRACK MANIFEST</span>
                  <span>COUNT: {playlist.tracks?.length || 0} TRACKS</span>
                </div>

                {playlist.tracks?.length === 0 ? (
                  <div className="border border-border p-12 text-center space-y-5 bg-background font-mono">
                    <p className="text-xs text-secondary uppercase tracking-widest">
                      NO TRACKS CACHED YET FOR THIS PLAYLIST.
                    </p>
                    {playlist.spotifyId === "liked_songs" && (
                      <p className="text-[11px] text-secondary max-w-md mx-auto leading-relaxed">
                        If fetching returns 0 tracks, your Spotify session may be missing the &apos;user-library-read&apos; permission. Reconnect your account below to grant library access.
                      </p>
                    )}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                      <button
                        onClick={() => fetchPlaylist(true)}
                        disabled={syncing}
                        className="px-6 py-2.5 border border-foreground bg-foreground text-background font-mono text-xs font-bold tracking-widest uppercase hover:bg-background hover:text-foreground transition-all disabled:opacity-50"
                      >
                        {syncing ? "FETCHING TRACKS FROM SPOTIFY..." : "FETCH TRACKS FROM SPOTIFY"}
                      </button>
                      {playlist.spotifyId === "liked_songs" && (
                        <a
                          href="/api/auth/spotify"
                          className="px-6 py-2.5 border border-border hover:border-foreground text-foreground font-mono text-xs font-bold tracking-widest uppercase transition-all"
                        >
                          RECONNECT SPOTIFY
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <PlaylistTable tracks={playlist.tracks || []} />
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

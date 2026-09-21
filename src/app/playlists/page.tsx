"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { PlaylistCard } from "@/components/PlaylistCard";
import { SearchInput } from "@/components/SearchInput";
import { LoadingState } from "@/components/LoadingState";
import { EmptyState } from "@/components/EmptyState";
import { RefreshCw, ArrowUpDown, ChevronLeft, ChevronRight, Heart, ArrowRight } from "lucide-react";

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "trackCount">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchPlaylists = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams({
        q: search,
        sortBy,
        sortOrder,
        page: String(page),
        limit: "12",
        refresh: isRefresh ? "true" : "false",
      });

      const res = await fetch(`/api/playlists?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPlaylists(data.playlists || []);
        setTotalPages(data.totalPages || 1);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error("Failed to load playlists:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, sortBy, sortOrder, page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPlaylists();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchPlaylists]);

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    setPage(1);
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="PLAYLIST BROWSER" subtitle="SPOTIFY SOURCE REPOSITORY" />

        <main className="p-8 md:p-12 space-y-8 max-w-7xl">
          {/* Header Controls Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 border-b border-border pb-6">
            <div className="flex flex-1 items-center gap-4">
              <SearchInput
                value={search}
                onChange={(val) => {
                  setSearch(val);
                  setPage(1);
                }}
                placeholder="FILTER PLAYLISTS..."
              />

              <div className="flex items-center gap-2 font-mono text-xs">
                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value as any);
                    setPage(1);
                  }}
                  className="bg-background border border-border px-3 py-2.5 uppercase text-foreground focus:outline-none focus:border-foreground"
                >
                  <option value="name">SORT BY NAME</option>
                  <option value="trackCount">SORT BY TRACKS</option>
                </select>

                <button
                  onClick={toggleSortOrder}
                  aria-label="Toggle sort order"
                  title="Toggle Ascending/Descending"
                  className="p-2.5 border border-border hover:border-foreground transition-colors"
                >
                  <ArrowUpDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between md:justify-end gap-4">
              <span className="font-mono text-xs text-secondary uppercase tracking-widest">
                {total} {total === 1 ? "PLAYLIST" : "PLAYLISTS"}
              </span>

              <button
                onClick={() => fetchPlaylists(true)}
                disabled={refreshing}
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-border hover:border-foreground font-mono text-xs uppercase tracking-widest transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                <span>{refreshing ? "SYNCING..." : "SYNC SPOTIFY"}</span>
              </button>
            </div>
          </div>

          {/* Pinned Liked Songs Hero Card */}
          <div className="border border-foreground bg-foreground/5 p-6 md:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative overflow-hidden group">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 border border-foreground bg-foreground text-background flex items-center justify-center shrink-0">
                <Heart className="w-7 h-7 fill-current" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold tracking-widest uppercase bg-foreground text-background px-2 py-0.5">
                    SOURCE // SAVED TRACKS
                  </span>
                  <span className="text-xs font-mono text-secondary uppercase tracking-widest">
                    SPOTIFY LIBRARY
                  </span>
                </div>
                <h2 className="font-dot text-2xl tracking-wider uppercase font-bold text-foreground">
                  LIKED SONGS
                </h2>
                <p className="text-xs font-mono text-secondary leading-relaxed">
                  Migrate your complete Spotify Liked Songs collection directly into YouTube Music.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 pt-4 sm:pt-0 border-t sm:border-t-0 border-border">
              <Link
                href="/playlists/liked_songs"
                className="px-4 py-3 border border-border hover:border-foreground text-xs font-mono tracking-widest uppercase transition-colors"
              >
                PREVIEW
              </Link>
              <Link
                href="/transfers/new?playlistId=liked_songs"
                className="inline-flex items-center gap-2 px-5 py-3 border border-foreground bg-foreground text-background hover:bg-background hover:text-foreground text-xs font-mono font-bold tracking-widest uppercase transition-all"
              >
                <span>TRANSFER LIKED SONGS</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Playlist Cards Grid */}
          {loading ? (
            <LoadingState label="FETCHING SPOTIFY CATALOG..." />
          ) : playlists.length === 0 ? (
            <EmptyState
              title="NO PLAYLISTS DETECTED"
              description="Could not find any playlists matching your current query or your Spotify account does not have any playlists yet."
              action={
                <button
                  onClick={() => fetchPlaylists(true)}
                  className="px-6 py-2.5 border border-foreground bg-foreground text-background font-mono text-xs font-bold tracking-widest uppercase"
                >
                  FORCE RE-SYNC FROM SPOTIFY
                </button>
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {playlists
                  .filter((pl) => pl.spotifyId !== "liked_songs")
                  .map((pl) => (
                    <PlaylistCard
                      key={pl.id}
                      id={pl.id}
                      name={pl.name}
                      description={pl.description}
                      trackCount={pl.trackCount}
                      imageUrl={pl.imageUrl}
                    />
                  ))}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border pt-6 font-mono text-xs">
                  <span className="text-secondary tracking-widest uppercase">
                    PAGE {page} OF {totalPages}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="p-2 border border-border hover:border-foreground disabled:opacity-30 disabled:hover:border-border transition-colors"
                      aria-label="Previous Page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="p-2 border border-border hover:border-foreground disabled:opacity-30 disabled:hover:border-border transition-colors"
                      aria-label="Next Page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

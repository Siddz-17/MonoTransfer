"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { TransferHistoryCard } from "@/components/TransferHistoryCard";
import { LoadingState } from "@/components/LoadingState";
import { EmptyState } from "@/components/EmptyState";
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";

export default function TransfersHistoryPage() {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchTransfers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/transfers?page=${page}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setTransfers(data.transfers || []);
        setTotalPages(data.totalPages || 1);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error("Error loading transfer history:", err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="TRANSFER AUDIT TRAIL" subtitle="CHRONOLOGICAL MIGRATION ARCHIVE" />

        <main className="p-8 md:p-12 space-y-8 max-w-7xl font-mono">
          {/* Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
            <div>
              <h2 className="font-dot text-2xl tracking-wider uppercase font-bold text-foreground">
                HISTORICAL MIGRATIONS
              </h2>
              <p className="text-xs text-secondary mt-1 tracking-wider uppercase">
                TOTAL: {total} RECORDS ARCHIVED
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={fetchTransfers}
                aria-label="Refresh transfers"
                className="p-2.5 border border-border hover:border-foreground text-secondary hover:text-foreground transition-all"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              <Link
                href="/playlists"
                className="inline-flex items-center gap-2 px-5 py-2.5 border border-foreground bg-foreground text-background hover:bg-background hover:text-foreground text-xs font-bold tracking-widest uppercase transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>START TRANSFER</span>
              </Link>
            </div>
          </div>

          {loading ? (
            <LoadingState label="RETRIEVING AUDIT ARCHIVES..." />
          ) : transfers.length === 0 ? (
            <EmptyState
              title="NO TRANSFERS RECORDED"
              description="You have not initiated any playlist transfers yet. Select a playlist to begin."
              action={
                <Link
                  href="/playlists"
                  className="px-6 py-2.5 border border-foreground bg-foreground text-background text-xs font-bold tracking-widest uppercase inline-block"
                >
                  BROWSE SPOTIFY PLAYLISTS
                </Link>
              }
            />
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                {transfers.map((t) => (
                  <TransferHistoryCard
                    key={t.id}
                    id={t.id}
                    targetPlaylistName={t.targetPlaylistName}
                    sourcePlaylistName={t.sourcePlaylist?.name}
                    status={t.status}
                    totalTracks={t.totalTracks}
                    matchedCount={t.matchedCount}
                    failedCount={t.failedCount}
                    createdAt={t.createdAt}
                    completedAt={t.completedAt}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border pt-6 text-xs">
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
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

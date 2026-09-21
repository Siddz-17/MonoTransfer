"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { TransferHistoryCard } from "@/components/TransferHistoryCard";
import { LoadingState } from "@/components/LoadingState";
import { ArrowRight, Disc, PlaySquare, ArrowUpRight, Plus, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    session: any;
    transfers: any[];
    stats: {
      totalTransfers: number;
      totalTracks: number;
      matchedTracks: number;
      failedMatches: number;
      accuracyRate: number;
    };
  }>({
    session: null,
    transfers: [],
    stats: { totalTransfers: 0, totalTracks: 0, matchedTracks: 0, failedMatches: 0, accuracyRate: 0 },
  });

  const loadDashboardData = async () => {
    try {
      const [sessionRes, transfersRes] = await Promise.all([
        fetch("/api/auth/session"),
        fetch("/api/transfers?limit=5"),
      ]);

      const sessionData = await sessionRes.json();
      const transfersData = await transfersRes.json();

      const transfers = transfersData.transfers || [];
      const totalTransfers = transfersData.total || 0;

      let totalTracks = 0;
      let matchedTracks = 0;
      let failedMatches = 0;

      for (const t of transfers) {
        totalTracks += t.totalTracks || 0;
        matchedTracks += t.matchedCount || 0;
        failedMatches += t.failedCount || 0;
      }

      const accuracyRate = totalTracks > 0 ? Math.round((matchedTracks / totalTracks) * 100) : 100;

      setData({
        session: sessionData,
        transfers,
        stats: {
          totalTransfers,
          totalTracks,
          matchedTracks,
          failedMatches,
          accuracyRate,
        },
      });
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="DASHBOARD" subtitle="SYSTEM TELEMETRY & TRANSFER OVERVIEW" />

        <main className="p-8 md:p-12 space-y-12 max-w-7xl">
          {loading ? (
            <LoadingState label="FETCHING TELEMETRY..." />
          ) : (
            <>
              {/* Top Action Row */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
                <div>
                  <h2 className="font-dot text-2xl tracking-wider uppercase font-bold">
                    OPERATIONAL STATUS
                  </h2>
                  <p className="font-mono text-xs text-secondary mt-1 tracking-wider uppercase">
                    USER: {data.session?.user?.name || "AUTHENTICATED OPERATOR"}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={loadDashboardData}
                    aria-label="Refresh telemetry"
                    className="p-2.5 border border-border hover:border-foreground text-secondary hover:text-foreground transition-all"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <Link
                    href="/playlists"
                    className="inline-flex items-center gap-2 px-5 py-2.5 border border-foreground bg-foreground text-background hover:bg-background hover:text-foreground font-mono text-xs font-bold tracking-widest uppercase transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span>NEW TRANSFER</span>
                  </Link>
                </div>
              </div>

              {/* Statistics Grid */}
              <section className="space-y-4">
                <span className="font-mono text-[11px] text-secondary tracking-widest uppercase block">
                  // TELEMETRY METRICS
                </span>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="border border-border p-6 bg-background space-y-2">
                    <span className="font-mono text-[11px] text-secondary tracking-widest uppercase block">
                      TOTAL TRANSFERS
                    </span>
                    <span className="font-dot text-4xl font-bold text-foreground block">
                      {data.stats.totalTransfers}
                    </span>
                    <span className="font-mono text-[10px] text-secondary tracking-wider block">
                      ALL COMPLETED JOBS
                    </span>
                  </div>

                  <div className="border border-border p-6 bg-background space-y-2">
                    <span className="font-mono text-[11px] text-secondary tracking-widest uppercase block">
                      TRACKS PROCESSED
                    </span>
                    <span className="font-dot text-4xl font-bold text-foreground block">
                      {data.stats.totalTracks}
                    </span>
                    <span className="font-mono text-[10px] text-secondary tracking-wider block">
                      MIGRATION VOLUME
                    </span>
                  </div>

                  <div className="border border-border p-6 bg-background space-y-2">
                    <span className="font-mono text-[11px] text-secondary tracking-widest uppercase block">
                      MATCH ACCURACY
                    </span>
                    <span className="font-dot text-4xl font-bold text-foreground block">
                      {data.stats.accuracyRate}%
                    </span>
                    <span className="font-mono text-[10px] text-secondary tracking-wider block">
                      DICE CONFIDENCE &gt; 0.72
                    </span>
                  </div>

                  <div className="border border-border p-6 bg-background space-y-2">
                    <span className="font-mono text-[11px] text-secondary tracking-widest uppercase block">
                      PENDING REVIEW
                    </span>
                    <span className="font-dot text-4xl font-bold text-foreground block">
                      {data.stats.failedMatches}
                    </span>
                    <span className="font-mono text-[10px] text-secondary tracking-wider block">
                      UNRESOLVED TRACKS
                    </span>
                  </div>
                </div>
              </section>

              {/* Connected Accounts Section */}
              <section className="space-y-4">
                <span className="font-mono text-[11px] text-secondary tracking-widest uppercase block">
                  // LINKED PROVIDER ACCOUNTS
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Spotify Provider Card */}
                  <div className="border border-border p-6 space-y-5 bg-background">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 border border-border flex items-center justify-center">
                          <Disc className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-dot text-base tracking-widest uppercase font-bold">
                            SPOTIFY API
                          </h3>
                          <p className="font-mono text-xs text-secondary">
                            SOURCE CATALOG PROVIDER
                          </p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "px-2.5 py-1 text-[10px] font-mono tracking-widest uppercase border",
                          data.session?.connections?.spotify
                            ? "bg-foreground text-background border-foreground font-bold"
                            : "border-secondary text-secondary"
                        )}
                      >
                        {data.session?.connections?.spotify ? "● CONNECTED" : "○ DISCONNECTED"}
                      </span>
                    </div>
                    <p className="font-mono text-xs text-secondary leading-relaxed">
                      Authorizes read access to public and private playlists and track catalogs.
                    </p>
                    <div className="pt-2">
                      {data.session?.connections?.spotify ? (
                        <Link
                          href="/settings"
                          className="font-mono text-xs tracking-widest text-secondary hover:text-foreground underline underline-offset-4"
                        >
                          MANAGE CONNECTION →
                        </Link>
                      ) : (
                        <a
                          href="/api/auth/spotify"
                          className="inline-flex items-center gap-2 px-4 py-2 border border-foreground font-mono text-xs font-bold tracking-widest uppercase hover:bg-foreground hover:text-background transition-all"
                        >
                          <span>CONNECT SPOTIFY</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Google / YouTube Provider Card */}
                  <div className="border border-border p-6 space-y-5 bg-background">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 border border-border flex items-center justify-center">
                          <PlaySquare className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-dot text-base tracking-widest uppercase font-bold">
                            YOUTUBE MUSIC
                          </h3>
                          <p className="font-mono text-xs text-secondary">
                            TARGET DESTINATION PROVIDER
                          </p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "px-2.5 py-1 text-[10px] font-mono tracking-widest uppercase border",
                          data.session?.connections?.google
                            ? "bg-foreground text-background border-foreground font-bold"
                            : "border-secondary text-secondary"
                        )}
                      >
                        {data.session?.connections?.google ? "● CONNECTED" : "○ DISCONNECTED"}
                      </span>
                    </div>
                    <p className="font-mono text-xs text-secondary leading-relaxed">
                      Authorizes official OAuth YouTube Data API write access to insert tracks and create playlists.
                    </p>
                    <div className="pt-2">
                      {data.session?.connections?.google ? (
                        <Link
                          href="/settings"
                          className="font-mono text-xs tracking-widest text-secondary hover:text-foreground underline underline-offset-4"
                        >
                          MANAGE CONNECTION →
                        </Link>
                      ) : (
                        <a
                          href="/api/auth/google"
                          className="inline-flex items-center gap-2 px-4 py-2 border border-foreground font-mono text-xs font-bold tracking-widest uppercase hover:bg-foreground hover:text-background transition-all"
                        >
                          <span>CONNECT GOOGLE</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* Recent Transfers Section */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-secondary tracking-widest uppercase">
                    // RECENT MIGRATIONS
                  </span>
                  {data.transfers.length > 0 && (
                    <Link
                      href="/transfers"
                      className="font-mono text-xs tracking-widest text-secondary hover:text-foreground uppercase flex items-center gap-1.5"
                    >
                      <span>VIEW ALL</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>

                {data.transfers.length === 0 ? (
                  <div className="border border-border p-12 text-center space-y-3">
                    <p className="font-mono text-xs text-secondary uppercase tracking-widest">
                      NO TRANSFERS RECORDED YET.
                    </p>
                    <Link
                      href="/playlists"
                      className="inline-flex items-center gap-2 px-4 py-2 border border-foreground bg-foreground text-background text-xs font-mono font-bold tracking-widest uppercase"
                    >
                      START YOUR FIRST MIGRATION
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.transfers.map((t) => (
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
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

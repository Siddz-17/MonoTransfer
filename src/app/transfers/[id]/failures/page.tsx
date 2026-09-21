"use client";

import { useEffect, useState, use } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { Modal } from "@/components/Modal";
import { LoadingState } from "@/components/LoadingState";
import { EmptyState } from "@/components/EmptyState";
import { ArrowLeft, Search, Check, SkipForward, ExternalLink, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export default function FailedMatchesPage() {
  const params = useParams();
  const router = useRouter();
  const transferId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [failedMatches, setFailedMatches] = useState<any[]>([]);
  const [activeSearchItem, setActiveSearchItem] = useState<any | null>(null);
  const [customQuery, setCustomQuery] = useState("");
  const [searchingAgain, setSearchingAgain] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const loadFailures = async () => {
    try {
      const res = await fetch(`/api/failed-matches?transferId=${transferId}`);
      if (res.ok) {
        const data = await res.json();
        setFailedMatches(data.failedMatches || []);
      }
    } catch (err) {
      console.error("Error fetching failed matches:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (transferId) {
      loadFailures();
    }
  }, [transferId]);

  const handleManualSelect = async (failedMatchId: string, candidate: any) => {
    setActionInProgress(failedMatchId);
    try {
      const res = await fetch(`/api/failed-matches/${failedMatchId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "manual_select",
          videoId: candidate.videoId,
          title: candidate.title,
          artist: Array.isArray(candidate.artists) ? candidate.artists.join(", ") : candidate.artists,
        }),
      });

      if (res.ok) {
        setFailedMatches((prev) =>
          prev.map((item) =>
            item.id === failedMatchId
              ? { ...item, resolved: true, resolvedTitle: candidate.title, resolvedVideoId: candidate.videoId }
              : item
          )
        );
        if (activeSearchItem?.id === failedMatchId) {
          setActiveSearchItem(null);
        }
      }
    } catch (err) {
      console.error("Manual selection error:", err);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleSkip = async (failedMatchId: string) => {
    setActionInProgress(failedMatchId);
    try {
      const res = await fetch(`/api/failed-matches/${failedMatchId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "skip" }),
      });

      if (res.ok) {
        setFailedMatches((prev) =>
          prev.map((item) =>
            item.id === failedMatchId ? { ...item, resolved: true, resolvedTitle: "[SKIPPED]" } : item
          )
        );
      }
    } catch (err) {
      console.error("Skip error:", err);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCustomSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSearchItem || !customQuery.trim()) return;

    setSearchingAgain(true);
    try {
      const res = await fetch(`/api/failed-matches/${activeSearchItem.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "search_again",
          customQuery: customQuery.trim(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Update active item suggestions
        const updated = {
          ...activeSearchItem,
          suggestedCandidatesJson: JSON.stringify(data.suggestions || []),
        };
        setActiveSearchItem(updated);

        // Update list
        setFailedMatches((prev) =>
          prev.map((item) => (item.id === activeSearchItem.id ? updated : item))
        );
      }
    } catch (err) {
      console.error("Search again error:", err);
    } finally {
      setSearchingAgain(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="FAILED MATCHES RESOLUTION" subtitle="MANUAL OVERRIDE & CANDIDATE SELECTOR" />

        <main className="p-8 md:p-12 space-y-8 max-w-7xl font-mono">
          <div>
            <Link
              href={`/transfers/${transferId}`}
              className="inline-flex items-center gap-2 text-xs text-secondary hover:text-foreground tracking-widest uppercase transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>RETURN TO TRANSFER DETAILS</span>
            </Link>
          </div>

          <div className="border-b border-border pb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-dot text-2xl tracking-wider uppercase font-bold text-foreground">
                UNMATCHED AUDIO TRACKS
              </h2>
              <p className="text-xs text-secondary mt-1 tracking-wider uppercase">
                RESOLVE TRACKS BELOW CONFIDENCE THRESHOLD
              </p>
            </div>

            <button
              onClick={loadFailures}
              className="inline-flex items-center gap-2 p-2.5 border border-border hover:border-foreground text-xs text-secondary hover:text-foreground transition-all uppercase"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>REFRESH</span>
            </button>
          </div>

          {loading ? (
            <LoadingState label="FETCHING UNMATCHED TRACKS..." />
          ) : failedMatches.length === 0 ? (
            <EmptyState
              title="ZERO FAILED MATCHES"
              description="All tracks in this migration were matched successfully with confidence clearing the required threshold."
              action={
                <Link
                  href={`/transfers/${transferId}`}
                  className="px-6 py-2.5 border border-foreground bg-foreground text-background text-xs font-bold tracking-widest uppercase inline-block"
                >
                  VIEW TRANSFER COMPLETION
                </Link>
              }
            />
          ) : (
            <div className="space-y-6">
              {failedMatches.map((item) => {
                let candidates: any[] = [];
                try {
                  candidates = item.suggestedCandidatesJson ? JSON.parse(item.suggestedCandidatesJson) : [];
                } catch {
                  candidates = [];
                }

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "border p-6 space-y-6 bg-background transition-all",
                      item.resolved ? "border-border/50 opacity-60" : "border-border hover:border-foreground"
                    )}
                  >
                    {/* Unmatched Song Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "px-2 py-0.5 text-[10px] uppercase font-bold tracking-widest border",
                              item.resolved
                                ? "bg-foreground text-background border-foreground"
                                : "border-foreground text-foreground"
                            )}
                          >
                            {item.resolved ? "● RESOLVED" : "✕ UNMATCHED"}
                          </span>
                          <span className="text-xs text-secondary uppercase">
                            SOURCE: {item.artist}
                          </span>
                        </div>
                        <h3 className="font-dot text-lg tracking-wider uppercase font-bold text-foreground mt-1">
                          {item.title}
                        </h3>
                        {item.album && (
                          <p className="text-xs text-secondary mt-0.5">
                            ALBUM: {item.album}
                          </p>
                        )}
                      </div>

                      {/* Header Actions */}
                      <div className="flex items-center gap-3">
                        {!item.resolved && (
                          <>
                            <button
                              onClick={() => {
                                setActiveSearchItem(item);
                                setCustomQuery(`${item.artist} ${item.title}`);
                              }}
                              className="inline-flex items-center gap-2 px-3 py-1.5 border border-border hover:border-foreground text-xs uppercase tracking-wider transition-colors"
                            >
                              <Search className="w-3.5 h-3.5" />
                              <span>SEARCH AGAIN</span>
                            </button>

                            <button
                              onClick={() => handleSkip(item.id)}
                              disabled={actionInProgress === item.id}
                              className="inline-flex items-center gap-2 px-3 py-1.5 border border-border hover:border-foreground text-xs uppercase tracking-wider text-secondary hover:text-foreground transition-colors disabled:opacity-50"
                            >
                              <SkipForward className="w-3.5 h-3.5" />
                              <span>SKIP</span>
                            </button>
                          </>
                        )}
                        {item.resolved && (
                          <span className="text-xs text-secondary uppercase">
                            MATCH: {item.resolvedTitle || "RESOLVED"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Candidate Suggestions */}
                    {!item.resolved && (
                      <div className="space-y-3">
                        <span className="text-[11px] text-secondary tracking-widest uppercase block">
                          SUGGESTED CANDIDATES (SCORED BY DICE SIMILARITY & DURATION):
                        </span>

                        {candidates.length === 0 ? (
                          <p className="text-xs text-secondary italic">
                            No candidates found. Use &quot;Search Again&quot; with modified search terms.
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {candidates.map((cand: any, cIdx: number) => (
                              <div
                                key={cand.videoId || cIdx}
                                className="border border-border p-3.5 flex flex-col justify-between hover:border-foreground transition-all group bg-muted/10"
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] text-secondary uppercase">
                                      CONFIDENCE: {cand.confidenceScore ? `${(cand.confidenceScore * 100).toFixed(0)}%` : "N/A"}
                                    </span>
                                    <a
                                      href={`https://music.youtube.com/watch?v=${cand.videoId}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-secondary hover:text-foreground p-0.5"
                                      title="Preview on YouTube Music"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </div>
                                  <p className="font-semibold text-xs text-foreground truncate">
                                    {cand.title}
                                  </p>
                                  <p className="text-[11px] text-secondary truncate">
                                    {Array.isArray(cand.artists) ? cand.artists.join(", ") : cand.artists || "Unknown"}
                                  </p>
                                </div>

                                <div className="pt-3 mt-3 border-t border-border flex justify-end">
                                  <button
                                    onClick={() => handleManualSelect(item.id, cand)}
                                    disabled={actionInProgress === item.id}
                                    className="inline-flex items-center gap-1.5 px-3 py-1 border border-foreground bg-foreground text-background hover:bg-background hover:text-foreground text-[11px] font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>SELECT CANDIDATE</span>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Modal for Search Again */}
          <Modal
            isOpen={Boolean(activeSearchItem)}
            onClose={() => setActiveSearchItem(null)}
            title="CUSTOM CATALOG SEARCH"
          >
            <form onSubmit={handleCustomSearch} className="space-y-6">
              <div className="space-y-2">
                <span className="text-xs text-secondary uppercase block">
                  ORIGINAL TRACK: {activeSearchItem?.title}
                </span>
                <input
                  type="text"
                  required
                  value={customQuery}
                  onChange={(e) => setCustomQuery(e.target.value)}
                  placeholder="CUSTOM QUERY E.G. ARTIST TITLE..."
                  className="w-full bg-background border border-border p-3 font-mono text-xs uppercase text-foreground focus:border-foreground focus:outline-none tracking-wider"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveSearchItem(null)}
                  className="px-4 py-2 border border-border text-xs uppercase text-secondary hover:text-foreground"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={searchingAgain}
                  className="px-6 py-2 border border-foreground bg-foreground text-background text-xs font-bold uppercase tracking-wider hover:bg-background hover:text-foreground transition-all disabled:opacity-50"
                >
                  {searchingAgain ? "SEARCHING..." : "QUERY CATALOG"}
                </button>
              </div>
            </form>
          </Modal>
        </main>
      </div>
    </div>
  );
}

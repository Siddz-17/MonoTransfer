"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { CheckboxGroup } from "@/components/CheckboxGroup";
import { LoadingState } from "@/components/LoadingState";
import { ArrowLeft, ArrowRight, Settings2, Sliders } from "lucide-react";
import { cn } from "@/lib/utils";

function TransferConfigurationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const playlistId = searchParams.get("playlistId");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sourcePlaylist, setSourcePlaylist] = useState<any>(null);
  const [existingPlaylists, setExistingPlaylists] = useState<any[]>([]);

  // Form State
  const [mode, setMode] = useState<"NEW" | "EXISTING">("NEW");
  const [targetName, setTargetName] = useState("");
  const [selectedExistingId, setSelectedExistingId] = useState("");

  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [retryFailedMatches, setRetryFailedMatches] = useState(true);
  const [matchExplicitVersions, setMatchExplicitVersions] = useState(true);
  const [matchLiveVersions, setMatchLiveVersions] = useState(false);
  const [privatePlaylist, setPrivatePlaylist] = useState(true);
  const [minConfidence, setMinConfidence] = useState(0.72);

  useEffect(() => {
    async function loadData() {
      if (!playlistId) {
        setLoading(false);
        return;
      }

      try {
        const [plRes, prefRes, ytRes] = await Promise.all([
          fetch(`/api/playlists/${playlistId}`),
          fetch("/api/settings/preferences"),
          fetch("/api/youtube/playlists"),
        ]);

        if (plRes.ok) {
          const plData = await plRes.json();
          setSourcePlaylist(plData.playlist);
          setTargetName(plData.playlist?.name || "Migrated Playlist");
        }

        if (prefRes.ok) {
          const prefData = await prefRes.json();
          if (prefData.preferences) {
            const p = prefData.preferences;
            setSkipDuplicates(p.skipDuplicates);
            setRetryFailedMatches(p.retryFailedMatches);
            setMatchExplicitVersions(p.matchExplicitVersions);
            setMatchLiveVersions(p.matchLiveVersions);
            setPrivatePlaylist(p.privatePlaylist);
            setMinConfidence(p.minimumConfidenceThreshold || 0.72);
          }
        }

        if (ytRes.ok) {
          const ytData = await ytRes.json();
          setExistingPlaylists(ytData.playlists || []);
          if (ytData.playlists?.length > 0) {
            setSelectedExistingId(ytData.playlists[0].id);
          }
        }
      } catch (err) {
        console.error("Error loading transfer config:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [playlistId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourcePlaylist) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePlaylistId: sourcePlaylist.id,
          targetPlaylistName: mode === "NEW" ? targetName : existingPlaylists.find(p => p.id === selectedExistingId)?.title || targetName,
          targetPlaylistId: mode === "EXISTING" ? selectedExistingId : null,
          mode,
          skipDuplicates,
          retryFailedMatches,
          matchExplicitVersions,
          matchLiveVersions,
          privatePlaylist,
          minimumConfidenceThreshold: minConfidence,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/transfers/${data.transferId}`);
      } else {
        const errorData = await res.json();
        alert(`Failed to launch migration: ${errorData.message || errorData.error}`);
        setSubmitting(false);
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`);
      setSubmitting(false);
    }
  };

  if (!playlistId) {
    return (
      <div className="min-h-screen flex bg-background text-foreground">
        <Sidebar />
        <div className="flex-1 p-12 font-mono">
          <p className="text-secondary text-xs">NO PLAYLIST SELECTED.</p>
          <Link href="/playlists" className="underline mt-2 block">SELECT A PLAYLIST FIRST</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="TRANSFER CONFIGURATION" subtitle="MATCHING ENGINE RULES & DESTINATION SETUP" />

        <main className="p-8 md:p-12 space-y-10 max-w-4xl">
          {/* Back button */}
          <div>
            <Link
              href={`/playlists/${playlistId}`}
              className="inline-flex items-center gap-2 font-mono text-xs text-secondary hover:text-foreground tracking-widest uppercase transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>CANCEL AND RETURN</span>
            </Link>
          </div>

          {loading ? (
            <LoadingState label="LOADING SOURCE METADATA..." />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-10">
              {/* Source Manifest Summary */}
              <div className="border border-border p-6 bg-background space-y-2 font-mono">
                <span className="text-[10px] text-secondary tracking-widest uppercase block">
                  SOURCE SPOTIFY MANIFEST
                </span>
                <div className="flex items-center justify-between">
                  <h3 className="font-dot text-xl tracking-wider uppercase font-bold text-foreground">
                    {sourcePlaylist?.name}
                  </h3>
                  <span className="border border-border px-2 py-0.5 text-xs font-bold">
                    {sourcePlaylist?.tracks?.length || sourcePlaylist?.trackCount} TRACKS
                  </span>
                </div>
              </div>

              {/* Destination Mode Selector */}
              <div className="space-y-4">
                <span className="font-mono text-[11px] text-secondary tracking-widest uppercase block">
                  // DESTINATION MODE
                </span>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setMode("NEW")}
                    className={cn(
                      "p-4 border text-left font-mono transition-all",
                      mode === "NEW"
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:border-foreground/50 bg-background text-foreground"
                    )}
                  >
                    <span className="font-bold text-xs uppercase tracking-wider block">
                      CREATE NEW PLAYLIST
                    </span>
                    <span className="text-[11px] opacity-80 mt-1 block">
                      Creates a fresh playlist in your YouTube Music account
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode("EXISTING")}
                    className={cn(
                      "p-4 border text-left font-mono transition-all",
                      mode === "EXISTING"
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:border-foreground/50 bg-background text-foreground"
                    )}
                  >
                    <span className="font-bold text-xs uppercase tracking-wider block">
                      USE EXISTING PLAYLIST
                    </span>
                    <span className="text-[11px] opacity-80 mt-1 block">
                      Appends matched tracks into an existing playlist
                    </span>
                  </button>
                </div>
              </div>

              {/* Target Details */}
              {mode === "NEW" ? (
                <div className="space-y-2 font-mono">
                  <label className="text-xs uppercase tracking-wider text-secondary block font-semibold">
                    TARGET PLAYLIST TITLE
                  </label>
                  <input
                    type="text"
                    required
                    value={targetName}
                    onChange={(e) => setTargetName(e.target.value)}
                    className="w-full bg-background border border-border p-3 font-mono text-sm text-foreground focus:border-foreground focus:outline-none uppercase tracking-wider"
                    placeholder="ENTER PLAYLIST NAME..."
                  />
                </div>
              ) : (
                <div className="space-y-2 font-mono">
                  <label className="text-xs uppercase tracking-wider text-secondary block font-semibold">
                    SELECT EXISTING DESTINATION PLAYLIST
                  </label>
                  {existingPlaylists.length === 0 ? (
                    <div className="border border-border p-4 text-xs text-secondary">
                      No existing YouTube playlists detected. Please create a new playlist.
                    </div>
                  ) : (
                    <select
                      value={selectedExistingId}
                      onChange={(e) => setSelectedExistingId(e.target.value)}
                      className="w-full bg-background border border-border p-3 font-mono text-xs uppercase text-foreground focus:border-foreground focus:outline-none"
                    >
                      {existingPlaylists.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title} ({p.itemCount} TRACKS)
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Matching Engine Checkboxes */}
              <div className="space-y-4">
                <span className="font-mono text-[11px] text-secondary tracking-widest uppercase block">
                  // MATCHING ENGINE ENGINE DIRECTIVES
                </span>

                <CheckboxGroup
                  options={[
                    {
                      id: "skipDuplicates",
                      label: "SKIP DUPLICATE TRACKS",
                      description: "Avoid inserting tracks that are already present in the target destination playlist.",
                      checked: skipDuplicates,
                      onChange: setSkipDuplicates,
                    },
                    {
                      id: "retryFailedMatches",
                      label: "RETRY FAILED MATCHES (RELAXED THRESHOLD)",
                      description: "Performs an automatic secondary evaluation pass with relaxed confidence threshold (max(0.5, threshold - 0.15)).",
                      checked: retryFailedMatches,
                      onChange: setRetryFailedMatches,
                    },
                    {
                      id: "matchExplicitVersions",
                      label: "MATCH EXPLICIT VERSIONS",
                      description: "Strictly prioritizes explicit audio cuts when the Spotify source is marked explicit, penalizing clean edits.",
                      checked: matchExplicitVersions,
                      onChange: setMatchExplicitVersions,
                    },
                    {
                      id: "matchLiveVersions",
                      label: "MATCH LIVE RECORDINGS",
                      description: "Permits concert and acoustic performances. When unchecked, heavy 0.15 penalty multiplier is applied to live markers.",
                      checked: matchLiveVersions,
                      onChange: setMatchLiveVersions,
                    },
                    {
                      id: "privatePlaylist",
                      label: "MAKE TARGET PLAYLIST PRIVATE",
                      description: "Sets destination playlist visibility to private rather than unlisted/public.",
                      checked: privatePlaylist,
                      onChange: setPrivatePlaylist,
                    },
                  ]}
                />
              </div>

              {/* Minimum Confidence Slider */}
              <div className="border border-border p-6 bg-background space-y-4 font-mono">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs uppercase tracking-wider font-semibold block text-foreground">
                      MINIMUM CONFIDENCE THRESHOLD
                    </span>
                    <p className="text-[11px] text-secondary leading-relaxed mt-0.5">
                      Weighted Dice + Artist + Duration score required to accept candidate.
                    </p>
                  </div>
                  <span className="border border-foreground bg-foreground text-background px-3 py-1 font-bold text-xs">
                    {(minConfidence * 100).toFixed(0)}%
                  </span>
                </div>

                <input
                  type="range"
                  min="0.50"
                  max="0.95"
                  step="0.01"
                  value={minConfidence}
                  onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
                  className="w-full accent-foreground cursor-pointer"
                />

                <div className="flex justify-between text-[10px] text-secondary">
                  <span>50% (PERMISSIVE)</span>
                  <span>72% (RECOMMENDED DEFAULT)</span>
                  <span>95% (STRICT)</span>
                </div>
              </div>

              {/* Submit Trigger */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-3 p-5 border border-foreground bg-foreground text-background hover:bg-background hover:text-foreground font-mono text-sm font-bold tracking-mega uppercase transition-all disabled:opacity-50"
                >
                  <span>{submitting ? "ENQUEUING MIGRATION..." : "LAUNCH MIGRATION PIPELINE"}</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}

export default function TransferConfigurationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <LoadingState label="INITIALIZING CONFIGURATION..." />
        </div>
      }
    >
      <TransferConfigurationForm />
    </Suspense>
  );
}

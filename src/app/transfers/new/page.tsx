"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { CheckboxGroup } from "@/components/CheckboxGroup";
import { LoadingState } from "@/components/LoadingState";
import { ArrowLeft, ArrowRight, Settings2, Sliders, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";

function TransferConfigurationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const playlistId = searchParams.get("playlistId");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sourcePlaylist, setSourcePlaylist] = useState<any>(null);
  const [existingPlaylists, setExistingPlaylists] = useState<any[]>([]);

  // Direction State: Spotify -> YouTube Music OR YouTube Music -> Spotify
  const [direction, setDirection] = useState<"SPOTIFY_TO_YTMUSIC" | "YTMUSIC_TO_SPOTIFY">("SPOTIFY_TO_YTMUSIC");
  const [selectedYtSourceId, setSelectedYtSourceId] = useState<string>("");

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

  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const fetchPromises: Promise<any>[] = [
          fetch("/api/auth/session"),
          fetch("/api/settings/preferences"),
          fetch("/api/youtube/playlists"),
        ];

        if (playlistId) {
          fetchPromises.push(fetch(`/api/playlists/${playlistId}`));
        }

        const [sessRes, prefRes, ytRes, plRes] = await Promise.all(fetchPromises);

        if (sessRes && sessRes.ok) {
          const sData = await sessRes.json();
          setSession(sData);
        }

        if (plRes && plRes.ok) {
          const plData = await plRes.json();
          setSourcePlaylist(plData.playlist);
          setTargetName(plData.playlist?.name || "Migrated Playlist");
        } else if (playlistId === "liked_songs") {
          setSourcePlaylist({ id: "liked_songs", name: "Liked Songs", trackCount: 0 });
          setTargetName("Spotify Liked Songs");
        }

        if (prefRes && prefRes.ok) {
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

        if (ytRes && ytRes.ok) {
          const ytData = await ytRes.json();
          const list = ytData.playlists || [];
          setExistingPlaylists(list);
          if (list.length > 0) {
            setSelectedExistingId(list[0].id);
            setSelectedYtSourceId(list[0].id);
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

    const isYtToSpotify = direction === "YTMUSIC_TO_SPOTIFY";
    const sourceId = isYtToSpotify ? selectedYtSourceId : sourcePlaylist?.id;

    if (!sourceId) {
      alert("Please choose a valid source playlist.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          sourcePlaylistId: sourceId,
          targetPlaylistName: isYtToSpotify
            ? targetName || "Migrated from YouTube Music"
            : mode === "NEW"
            ? targetName
            : existingPlaylists.find((p) => p.id === selectedExistingId)?.title || targetName,
          targetPlaylistId: !isYtToSpotify && mode === "EXISTING" ? selectedExistingId : null,
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

  if (!playlistId && direction === "SPOTIFY_TO_YTMUSIC" && !sourcePlaylist && existingPlaylists.length === 0 && !loading) {
    return (
      <div className="min-h-screen flex bg-background text-foreground">
        <Sidebar />
        <div className="flex-1 p-12 font-mono space-y-4">
          <p className="text-secondary text-xs uppercase">NO PLAYLIST SELECTED.</p>
          <Link href="/playlists" className="underline text-xs uppercase block">
            RETURN TO PLAYLISTS TO SELECT A SOURCE
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="TRANSFER CONFIGURATION" subtitle="MATCHING ENGINE RULES & BI-DIRECTIONAL SETUP" />

        <main className="p-8 md:p-12 space-y-10 max-w-4xl">
          {/* Back button */}
          <div>
            <Link
              href={playlistId ? `/playlists/${playlistId}` : "/playlists"}
              className="inline-flex items-center gap-2 font-mono text-xs text-secondary hover:text-foreground tracking-widest uppercase transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>RETURN</span>
            </Link>
          </div>

          {loading ? (
            <LoadingState label="LOADING SOURCE METADATA..." />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-10">
              {/* Direction Selector */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 font-mono text-[11px] text-secondary tracking-widest uppercase">
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span>// MIGRATION DIRECTION</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setDirection("SPOTIFY_TO_YTMUSIC");
                      setTargetName(sourcePlaylist?.name || "Migrated Playlist");
                    }}
                    className={cn(
                      "p-5 border text-left font-mono transition-all",
                      direction === "SPOTIFY_TO_YTMUSIC"
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:border-foreground/50 bg-background text-foreground"
                    )}
                  >
                    <span className="font-bold text-xs uppercase tracking-wider block">
                      SPOTIFY → YOUTUBE MUSIC
                    </span>
                    <span className="text-[11px] opacity-80 mt-1.5 block">
                      Transfer playlists & Liked Songs from Spotify to YouTube Music
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDirection("YTMUSIC_TO_SPOTIFY");
                      if (existingPlaylists.length > 0) {
                        setTargetName(existingPlaylists[0].title || "Migrated from YouTube Music");
                      }
                    }}
                    className={cn(
                      "p-5 border text-left font-mono transition-all",
                      direction === "YTMUSIC_TO_SPOTIFY"
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:border-foreground/50 bg-background text-foreground"
                    )}
                  >
                    <span className="font-bold text-xs uppercase tracking-wider block">
                      YOUTUBE MUSIC → SPOTIFY
                    </span>
                    <span className="text-[11px] opacity-80 mt-1.5 block">
                      Transfer playlists from YouTube Music into your Spotify account
                    </span>
                  </button>
                </div>
              </div>

              {/* Source Manifest Summary */}
              {direction === "SPOTIFY_TO_YTMUSIC" ? (
                <div className="border border-border p-6 bg-background space-y-2 font-mono">
                  <span className="text-[10px] text-secondary tracking-widest uppercase block">
                    SOURCE SPOTIFY PLAYLIST
                  </span>
                  <div className="flex items-center justify-between">
                    <h3 className="font-dot text-xl tracking-wider uppercase font-bold text-foreground">
                      {sourcePlaylist?.name || "Spotify Playlist"}
                    </h3>
                    <span className="border border-border px-2 py-0.5 text-xs font-bold">
                      {sourcePlaylist?.tracks?.length || sourcePlaylist?.trackCount || 0} TRACKS
                    </span>
                  </div>
                </div>
              ) : (
                <div className="border border-border p-6 bg-background space-y-3 font-mono">
                  <label className="text-xs uppercase tracking-wider text-secondary block font-semibold">
                    SELECT SOURCE YOUTUBE MUSIC PLAYLIST
                  </label>
                  {existingPlaylists.length === 0 ? (
                    <p className="text-xs text-secondary">No YouTube Music playlists found for this Google account.</p>
                  ) : (
                    <select
                      value={selectedYtSourceId}
                      onChange={(e) => {
                        setSelectedYtSourceId(e.target.value);
                        const pl = existingPlaylists.find((p) => p.id === e.target.value);
                        if (pl) setTargetName(pl.title);
                      }}
                      className="w-full bg-background border border-border p-3 uppercase text-xs focus:outline-none focus:border-foreground font-mono"
                    >
                      {existingPlaylists.map((pl) => (
                        <option key={pl.id} value={pl.id}>
                          {pl.title} ({pl.itemCount} TRACKS)
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Target Details */}
              <div className="space-y-4">
                <span className="font-mono text-[11px] text-secondary tracking-widest uppercase block">
                  // DESTINATION CONFIGURATION ({direction === "SPOTIFY_TO_YTMUSIC" ? "YOUTUBE MUSIC" : "SPOTIFY"})
                </span>

                {/* Connection Status Warning */}
                {direction === "SPOTIFY_TO_YTMUSIC" && session && !session.connections?.google && (
                  <div className="border border-foreground p-5 bg-background font-mono text-xs space-y-3">
                    <div className="flex items-center gap-2 font-bold uppercase text-foreground">
                      <span className="w-2 h-2 rounded-full bg-foreground" />
                      <span>GOOGLE / YOUTUBE MUSIC IS NOT CONNECTED</span>
                    </div>
                    <p className="text-secondary leading-relaxed text-[11px]">
                      Your Google account is currently unlinked. To allow MonoTransfer to create playlists and add songs directly into your YouTube Music library, you must connect your Google account before starting.
                    </p>
                    <div className="pt-1">
                      <a
                        href="/api/auth/google"
                        className="inline-flex items-center gap-2 px-4 py-2 border border-foreground bg-foreground text-background font-bold text-xs uppercase hover:bg-background hover:text-foreground transition-all"
                      >
                        <span>CONNECT GOOGLE NOW</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                )}

                {direction === "YTMUSIC_TO_SPOTIFY" && session && !session.connections?.spotify && (
                  <div className="border border-foreground p-5 bg-background font-mono text-xs space-y-3">
                    <div className="flex items-center gap-2 font-bold uppercase text-foreground">
                      <span className="w-2 h-2 rounded-full bg-foreground" />
                      <span>SPOTIFY IS NOT CONNECTED</span>
                    </div>
                    <p className="text-secondary leading-relaxed text-[11px]">
                      Your Spotify account is unlinked. Connect Spotify so MonoTransfer can write playlists to your Spotify library.
                    </p>
                    <div className="pt-1">
                      <a
                        href="/api/auth/spotify"
                        className="inline-flex items-center gap-2 px-4 py-2 border border-foreground bg-foreground text-background font-bold text-xs uppercase hover:bg-background hover:text-foreground transition-all"
                      >
                        <span>CONNECT SPOTIFY NOW</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                )}

                <div className="space-y-2 font-mono">
                  <label className="text-xs uppercase tracking-wider text-secondary block font-semibold">
                    TARGET PLAYLIST TITLE
                  </label>
                  <input
                    type="text"
                    required
                    value={targetName}
                    onChange={(e) => setTargetName(e.target.value)}
                    placeholder="Enter destination playlist title..."
                    className="w-full bg-background border border-border p-3.5 text-foreground text-xs uppercase focus:outline-none focus:border-foreground font-mono"
                  />
                </div>
              </div>

              {/* Engine Tuning Options */}
              <div className="space-y-6 pt-4 border-t border-border font-mono">
                <div className="flex items-center gap-2 text-xs text-secondary tracking-widest uppercase font-semibold">
                  <Sliders className="w-4 h-4" />
                  <span>MATCHING ENGINE RULES</span>
                </div>

                <div className="space-y-4">
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={skipDuplicates}
                      onChange={(e) => setSkipDuplicates(e.target.checked)}
                      className="mt-1 border-border rounded-none"
                    />
                    <div>
                      <span className="text-xs font-bold uppercase block">SKIP DUPLICATE TRACKS</span>
                      <span className="text-[11px] text-secondary block">
                        Prevents adding identical recordings already present in the target
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={retryFailedMatches}
                      onChange={(e) => setRetryFailedMatches(e.target.checked)}
                      className="mt-1 border-border rounded-none"
                    />
                    <div>
                      <span className="text-xs font-bold uppercase block">AUTO-APPROVE BEST MATCHES</span>
                      <span className="text-[11px] text-secondary block">
                        Auto-selects the top available candidate for borderline songs so 100% of tracks migrate
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={matchExplicitVersions}
                      onChange={(e) => setMatchExplicitVersions(e.target.checked)}
                      className="mt-1 border-border rounded-none"
                    />
                    <div>
                      <span className="text-xs font-bold uppercase block">MATCH EXPLICIT VERSIONS</span>
                      <span className="text-[11px] text-secondary block">
                        Matches explicit recordings strictly to explicit releases
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={privatePlaylist}
                      onChange={(e) => setPrivatePlaylist(e.target.checked)}
                      className="mt-1 border-border rounded-none"
                    />
                    <div>
                      <span className="text-xs font-bold uppercase block">KEEP PLAYLIST PRIVATE</span>
                      <span className="text-[11px] text-secondary block">
                        Creates the target playlist as private/unlisted
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Submit CTA */}
              <div className="pt-6 border-t border-border flex items-center justify-between gap-4">
                <Link
                  href="/playlists"
                  className="text-xs font-mono text-secondary hover:text-foreground tracking-widest uppercase underline"
                >
                  DISCARD
                </Link>

                <button
                  type="submit"
                  disabled={
                    submitting ||
                    (direction === "SPOTIFY_TO_YTMUSIC" && !session?.connections?.google) ||
                    (direction === "YTMUSIC_TO_SPOTIFY" && !session?.connections?.spotify)
                  }
                  className="inline-flex items-center gap-3 px-8 py-4 border border-foreground bg-foreground text-background hover:bg-background hover:text-foreground font-mono text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50"
                >
                  <span>
                    {direction === "SPOTIFY_TO_YTMUSIC" && !session?.connections?.google
                      ? "CONNECT GOOGLE TO LAUNCH"
                      : direction === "YTMUSIC_TO_SPOTIFY" && !session?.connections?.spotify
                      ? "CONNECT SPOTIFY TO LAUNCH"
                      : submitting
                      ? "INITIALIZING PIPELINE..."
                      : "LAUNCH MIGRATION"}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}

export default function NewTransferPage() {
  return (
    <Suspense fallback={<LoadingState label="LOADING INTERFACE..." />}>
      <TransferConfigurationForm />
    </Suspense>
  );
}

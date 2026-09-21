"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { SettingsPanel } from "@/components/SettingsPanel";
import { CheckboxGroup } from "@/components/CheckboxGroup";
import { LoadingState } from "@/components/LoadingState";
import { Modal } from "@/components/Modal";
import { Disc, PlaySquare, Sun, Moon, Trash2, Check, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [session, setSession] = useState<any>(null);

  // Transfer Preferences State
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [retryFailedMatches, setRetryFailedMatches] = useState(true);
  const [matchExplicitVersions, setMatchExplicitVersions] = useState(true);
  const [matchLiveVersions, setMatchLiveVersions] = useState(false);
  const [privatePlaylist, setPrivatePlaylist] = useState(true);
  const [minConfidence, setMinConfidence] = useState(0.72);

  // Theme State
  const [isDark, setIsDark] = useState(true);

  // Danger Zone
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));

    async function loadData() {
      try {
        const [sessRes, prefRes] = await Promise.all([
          fetch("/api/auth/session"),
          fetch("/api/settings/preferences"),
        ]);

        if (sessRes.ok) {
          const sData = await sessRes.json();
          setSession(sData);
        }

        if (prefRes.ok) {
          const pData = await prefRes.json();
          if (pData.preferences) {
            const p = pData.preferences;
            setSkipDuplicates(p.skipDuplicates);
            setRetryFailedMatches(p.retryFailedMatches);
            setMatchExplicitVersions(p.matchExplicitVersions);
            setMatchLiveVersions(p.matchLiveVersions);
            setPrivatePlaylist(p.privatePlaylist);
            setMinConfidence(p.minimumConfidenceThreshold || 0.72);
          }
        }
      } catch (err) {
        console.error("Settings load error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPrefs(true);
    setSavedSuccess(false);

    try {
      const res = await fetch("/api/settings/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skipDuplicates,
          retryFailedMatches,
          matchExplicitVersions,
          matchLiveVersions,
          privatePlaylist,
          minimumConfidenceThreshold: minConfidence,
        }),
      });

      if (res.ok) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Save preferences error:", err);
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleDisconnect = async (provider: string) => {
    if (!confirm(`Are you sure you want to disconnect ${provider}?`)) return;

    try {
      const res = await fetch(`/api/settings/connections/${provider}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setSession((prev: any) => ({
          ...prev,
          connections: {
            ...prev?.connections,
            [provider]: false,
          },
        }));
      }
    } catch (err) {
      console.error("Disconnect error:", err);
    }
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      const res = await fetch("/api/settings/account", { method: "DELETE" });
      if (res.ok) {
        router.push("/");
      }
    } catch (err) {
      console.error("Account delete error:", err);
      setDeletingAccount(false);
    }
  };

  const setTheme = (dark: boolean) => {
    if (dark) {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    } else {
      document.documentElement.classList.remove("dark");
      setIsDark(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="SETTINGS" subtitle="CONFIGURATION, PROVIDERS & SYSTEM PREFERENCES" />

        <main className="p-8 md:p-12 space-y-10 max-w-4xl font-mono">
          {loading ? (
            <LoadingState label="FETCHING SYSTEM CONFIGURATION..." />
          ) : (
            <>
              {/* Provider Connections Panel */}
              <SettingsPanel
                title="EXTERNAL PROVIDER AUTHENTICATION"
                description="Manage linked OAuth 2.0 provider tokens encrypted at rest via AES-256-GCM."
              >
                <div className="space-y-4">
                  {/* Spotify */}
                  <div className="flex items-center justify-between p-4 border border-border bg-background">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 border border-border flex items-center justify-center">
                        <Disc className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-semibold text-xs uppercase block">SPOTIFY</span>
                        <span className="text-[11px] text-secondary">
                          {session?.connections?.spotify ? "● ACTIVE & ENCRYPTED" : "○ UNLINKED"}
                        </span>
                      </div>
                    </div>

                    {session?.connections?.spotify ? (
                      <button
                        onClick={() => handleDisconnect("spotify")}
                        className="px-3.5 py-1.5 border border-border hover:border-foreground text-xs uppercase tracking-wider text-secondary hover:text-foreground transition-all"
                      >
                        DISCONNECT
                      </button>
                    ) : (
                      <a
                        href="/api/auth/spotify"
                        className="inline-flex items-center gap-2 px-3.5 py-1.5 border border-foreground bg-foreground text-background text-xs uppercase font-bold tracking-wider hover:bg-background hover:text-foreground transition-all"
                      >
                        <span>CONNECT</span>
                        <ArrowRight className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  {/* Google */}
                  <div className="flex items-center justify-between p-4 border border-border bg-background">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 border border-border flex items-center justify-center">
                        <PlaySquare className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-semibold text-xs uppercase block">GOOGLE / YOUTUBE MUSIC</span>
                        <span className="text-[11px] text-secondary">
                          {session?.connections?.google ? "● ACTIVE & ENCRYPTED" : "○ UNLINKED"}
                        </span>
                      </div>
                    </div>

                    {session?.connections?.google ? (
                      <button
                        onClick={() => handleDisconnect("google")}
                        className="px-3.5 py-1.5 border border-border hover:border-foreground text-xs uppercase tracking-wider text-secondary hover:text-foreground transition-all"
                      >
                        DISCONNECT
                      </button>
                    ) : (
                      <a
                        href="/api/auth/google"
                        className="inline-flex items-center gap-2 px-3.5 py-1.5 border border-foreground bg-foreground text-background text-xs uppercase font-bold tracking-wider hover:bg-background hover:text-foreground transition-all"
                      >
                        <span>CONNECT</span>
                        <ArrowRight className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </SettingsPanel>

              {/* Theme Settings Panel */}
              <SettingsPanel
                title="MONOCHROME DISPLAY MODE"
                description="Strict Nothing OS monochromatic visual presentation. Zero color saturation."
              >
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setTheme(true)}
                    className={cn(
                      "p-4 border text-left transition-all",
                      isDark
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:border-foreground/50 bg-background text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Moon className="w-4 h-4" />
                      <span className="font-bold text-xs uppercase tracking-wider">DARK MODE</span>
                    </div>
                    <span className="text-[11px] opacity-80 block">#000000 background, #FFFFFF high-contrast text</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTheme(false)}
                    className={cn(
                      "p-4 border text-left transition-all",
                      !isDark
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:border-foreground/50 bg-background text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Sun className="w-4 h-4" />
                      <span className="font-bold text-xs uppercase tracking-wider">LIGHT MODE</span>
                    </div>
                    <span className="text-[11px] opacity-80 block">#FFFFFF background, #000000 high-contrast text</span>
                  </button>
                </div>
              </SettingsPanel>

              {/* Transfer Defaults Panel */}
              <form onSubmit={handleSavePreferences}>
                <SettingsPanel
                  title="DEFAULT TRANSFER DIRECTIVES"
                  description="Pre-configured directives automatically applied to new migration tasks."
                >
                  <div className="space-y-6">
                    <CheckboxGroup
                      options={[
                        {
                          id: "pref-skipDuplicates",
                          label: "SKIP DUPLICATES BY DEFAULT",
                          description: "Ignore track insertion if identical videoId was already added to the destination.",
                          checked: skipDuplicates,
                          onChange: setSkipDuplicates,
                        },
                        {
                          id: "pref-retryFailedMatches",
                          label: "RETRY FAILED MATCHES (RELAXED THRESHOLD)",
                          description: "Automatically perform a second evaluation pass with relaxed threshold.",
                          checked: retryFailedMatches,
                          onChange: setRetryFailedMatches,
                        },
                        {
                          id: "pref-matchExplicitVersions",
                          label: "PREFER EXPLICIT AUDIO EDITS",
                          description: "Heavily penalize clean-edit recordings when source track is marked explicit.",
                          checked: matchExplicitVersions,
                          onChange: setMatchExplicitVersions,
                        },
                        {
                          id: "pref-matchLiveVersions",
                          label: "ALLOW LIVE / CONCERT TRACKS",
                          description: "Allow live versions without applying the 0.15 negative penalty factor.",
                          checked: matchLiveVersions,
                          onChange: setMatchLiveVersions,
                        },
                        {
                          id: "pref-privatePlaylist",
                          label: "DEFAULT DESTINATION PRIVACY: PRIVATE",
                          description: "Ensure generated YouTube Music playlists are hidden from public searches.",
                          checked: privatePlaylist,
                          onChange: setPrivatePlaylist,
                        },
                      ]}
                    />

                    {/* Minimum Confidence Slider */}
                    <div className="border border-border p-5 bg-background space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs uppercase tracking-wider font-semibold block text-foreground">
                            DEFAULT MINIMUM CONFIDENCE THRESHOLD
                          </span>
                          <span className="text-[11px] text-secondary">
                            Cut-off confidence score required to auto-accept a candidate.
                          </span>
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
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      {savedSuccess ? (
                        <span className="text-xs uppercase tracking-wider font-bold flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5" />
                          <span>PREFERENCES SAVED TO DATABASE</span>
                        </span>
                      ) : (
                        <div />
                      )}

                      <button
                        type="submit"
                        disabled={savingPrefs}
                        className="px-6 py-3 border border-foreground bg-foreground text-background text-xs uppercase font-bold tracking-widest hover:bg-background hover:text-foreground transition-all disabled:opacity-50"
                      >
                        {savingPrefs ? "SAVING..." : "SAVE PREFERENCES"}
                      </button>
                    </div>
                  </div>
                </SettingsPanel>
              </form>

              {/* Danger Zone Panel */}
              <SettingsPanel
                title="DANGER ZONE // ACCOUNT MANAGEMENT"
                description="Irreversible system purge and credential revocation."
                danger
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border border-border">
                  <div>
                    <span className="font-bold text-xs uppercase block text-foreground">
                      PURGE ACCOUNT & STORED TOKENS
                    </span>
                    <p className="text-[11px] text-secondary mt-0.5 leading-relaxed">
                      Permanently wipes your user account, encrypted tokens, transfer history, and cached playlists.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(true)}
                    className="px-4 py-2 border border-foreground bg-foreground text-background hover:bg-background hover:text-foreground text-xs uppercase font-bold tracking-wider transition-all shrink-0"
                  >
                    PURGE ACCOUNT
                  </button>
                </div>
              </SettingsPanel>

              {/* Delete Account Modal */}
              <Modal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                title="CONFIRM ACCOUNT DELETION"
              >
                <div className="space-y-4">
                  <p className="text-xs text-secondary leading-relaxed">
                    This action is permanent and cannot be undone. All encrypted connection tokens, playlist caches, transfer history records, and audit logs will be permanently deleted from the database.
                  </p>

                  <div className="flex justify-end gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowDeleteModal(false)}
                      className="px-4 py-2 border border-border text-xs uppercase text-secondary hover:text-foreground"
                    >
                      ABORT
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteAccount}
                      disabled={deletingAccount}
                      className="px-5 py-2 border border-foreground bg-foreground text-background text-xs font-bold uppercase tracking-wider hover:bg-background hover:text-foreground transition-all disabled:opacity-50"
                    >
                      {deletingAccount ? "PURGING..." : "CONFIRM PURGE"}
                    </button>
                  </div>
                </div>
              </Modal>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

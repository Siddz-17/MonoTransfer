"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Disc, PlaySquare, ArrowRight, Play } from "lucide-react";

export default function LandingPage() {
  const router = useRouter();
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated) {
          router.push("/dashboard");
        } else {
          setCheckingSession(false);
        }
      })
      .catch(() => setCheckingSession(false));
  }, [router]);

  const handleDemoLogin = async () => {
    setLoadingDemo(true);
    try {
      const res = await fetch("/api/auth/demo", { method: "POST" });
      if (res.ok) {
        router.push("/dashboard");
      }
    } catch {
      setLoadingDemo(false);
    }
  };

  if (checkingSession) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <span className="font-mono text-xs tracking-widest text-secondary uppercase animate-pulse">
          INITIALIZING MONOTRANSFER...
        </span>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-foreground relative selection:bg-foreground selection:text-background">
      {/* Centered Monolithic Layout */}
      <div className="w-full max-w-xl text-center space-y-8">
        {/* Subtitle / Category */}
        <div className="flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-foreground" />
          <p className="font-mono text-xs uppercase tracking-mega text-secondary">
            SPOTIFY → YOUTUBE MUSIC
          </p>
        </div>

        {/* Hero Title */}
        <h1 className="font-dot text-5xl sm:text-7xl tracking-mega font-bold uppercase leading-none">
          MONOTRANSFER
        </h1>

        {/* Minimalist Subtext */}
        <p className="font-mono text-xs text-secondary tracking-widest uppercase max-w-sm mx-auto leading-relaxed">
          MINIMALIST INDUSTRIAL PLAYLIST MIGRATION ENGINE.
        </p>

        {/* Connect Action Buttons */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="/api/auth/spotify"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 border border-foreground bg-foreground text-background hover:bg-background hover:text-foreground font-mono text-xs font-bold tracking-widest uppercase transition-all"
          >
            <Disc className="w-4 h-4" />
            <span>CONNECT SPOTIFY</span>
          </a>

          <a
            href="/api/auth/google"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 border border-border hover:border-foreground bg-background text-foreground font-mono text-xs font-bold tracking-widest uppercase transition-all"
          >
            <PlaySquare className="w-4 h-4" />
            <span>CONNECT GOOGLE</span>
          </a>
        </div>

        {/* Instant Sandbox / Demo Mode Option */}
        <div className="pt-8">
          <button
            onClick={handleDemoLogin}
            disabled={loadingDemo}
            className="inline-flex items-center gap-2 border border-dashed border-secondary/60 hover:border-foreground px-5 py-2.5 font-mono text-[11px] tracking-widest uppercase text-secondary hover:text-foreground transition-all disabled:opacity-50"
          >
            <Play className="w-3 h-3" />
            <span>{loadingDemo ? "INITIALIZING SANDBOX..." : "ENTER SANDBOX DEMO MODE"}</span>
          </button>
        </div>
      </div>

      {/* Industrial Footer Note */}
      <footer className="absolute bottom-6 font-mono text-[10px] text-secondary tracking-widest uppercase">
        NOTHING OS INSPIRED // MONOCHROMATIC CORE // SPEC 1.0
      </footer>
    </main>
  );
}

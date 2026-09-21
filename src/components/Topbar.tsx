"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sun, Moon, LogOut, Disc, PlaySquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface TopbarProps {
  title?: string;
  subtitle?: string;
}

export function Topbar({ title, subtitle }: TopbarProps) {
  const router = useRouter();
  const [session, setSession] = useState<{
    authenticated: boolean;
    user?: { name: string; email: string };
    connections?: { spotify: boolean; google: boolean };
  } | null>(null);

  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => setSession(data))
      .catch(() => {});

    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleTheme = () => {
    if (document.documentElement.classList.contains("dark")) {
      document.documentElement.classList.remove("dark");
      setIsDark(false);
    } else {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  };

  return (
    <header className="h-20 border-b border-border px-8 flex items-center justify-between bg-background sticky top-0 z-20">
      <div>
        {title ? (
          <div>
            <h2 className="font-dot text-lg tracking-widest uppercase">{title}</h2>
            {subtitle && <p className="text-xs font-mono text-secondary mt-0.5">{subtitle}</p>}
          </div>
        ) : (
          <div className="text-xs font-mono text-secondary tracking-wider">
            STATUS: <span className="text-foreground font-semibold">ALL SYSTEMS NOMINAL</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        {/* Spotify Connection Badge */}
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 border text-xs font-mono tracking-wider",
            session?.connections?.spotify
              ? "border-foreground bg-foreground text-background font-semibold"
              : "border-border text-secondary"
          )}
        >
          <Disc className="w-3.5 h-3.5" />
          <span>SPOTIFY</span>
          <span className="text-[10px]">
            {session?.connections?.spotify ? "● LINKED" : "○ UNLINKED"}
          </span>
        </div>

        {/* Google / YouTube Connection Badge */}
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 border text-xs font-mono tracking-wider",
            session?.connections?.google
              ? "border-foreground bg-foreground text-background font-semibold"
              : "border-border text-secondary"
          )}
        >
          <PlaySquare className="w-3.5 h-3.5" />
          <span>YT MUSIC</span>
          <span className="text-[10px]">
            {session?.connections?.google ? "● LINKED" : "○ UNLINKED"}
          </span>
        </div>

        {/* Theme Switch */}
        <button
          onClick={toggleTheme}
          aria-label="Toggle Monochrome Theme"
          className="p-2 border border-border hover:bg-hover hover:border-foreground transition-all"
        >
          {isDark ? <Sun className="w-4 h-4 text-foreground" /> : <Moon className="w-4 h-4 text-foreground" />}
        </button>

        {/* Logout */}
        {session?.authenticated && (
          <button
            onClick={handleLogout}
            aria-label="Log Out"
            title="Log out"
            className="p-2 border border-border hover:bg-hover hover:border-foreground transition-all text-secondary hover:text-foreground"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
}

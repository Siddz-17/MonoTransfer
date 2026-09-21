"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListMusic, ArrowLeftRight, Settings, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { name: "DASHBOARD", href: "/dashboard", icon: LayoutDashboard },
  { name: "PLAYLISTS", href: "/playlists", icon: ListMusic },
  { name: "TRANSFERS", href: "/transfers", icon: ArrowLeftRight },
  { name: "SETTINGS", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-border min-h-screen bg-background flex flex-col justify-between p-6 select-none shrink-0">
      <div>
        {/* Brand Header */}
        <div className="mb-10">
          <Link href="/dashboard" className="group block">
            <h1 className="font-dot text-xl tracking-mega font-bold group-hover:opacity-80 transition-opacity">
              MONOTRANSFER
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <span className="w-2 h-2 rounded-full bg-foreground animate-pulse" />
              <p className="text-xs font-mono text-secondary tracking-widest uppercase">
                ENGINE V1.0 // ACTIVE
              </p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center justify-between px-3.5 py-3 border text-xs tracking-wider transition-all font-mono",
                  isActive
                    ? "bg-foreground text-background border-foreground font-semibold"
                    : "border-transparent text-secondary hover:text-foreground hover:bg-hover hover:border-border"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4" />
                  <span>{item.name}</span>
                </div>
                {isActive && <span className="text-[10px]">■</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer System Telemetry */}
      <div className="border border-border p-3.5 text-[11px] font-mono space-y-1.5 bg-muted/40">
        <div className="flex justify-between items-center text-secondary">
          <span>PIPELINE</span>
          <span className="text-foreground font-semibold">BULLMQ // REDIS</span>
        </div>
        <div className="flex justify-between items-center text-secondary">
          <span>PARALLELISM</span>
          <span className="text-foreground font-semibold">3 CONCURRENT</span>
        </div>
        <div className="flex justify-between items-center text-secondary">
          <span>MICROSERVICE</span>
          <span className="text-foreground font-semibold">YTMUSIC-API</span>
        </div>
      </div>
    </aside>
  );
}

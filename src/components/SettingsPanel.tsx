"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingsPanelProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  danger?: boolean;
}

export function SettingsPanel({
  title,
  description,
  children,
  className,
  danger = false,
}: SettingsPanelProps) {
  return (
    <div
      className={cn(
        "border p-6 sm:p-8 space-y-6 bg-background font-mono",
        danger ? "border-foreground" : "border-border",
        className
      )}
    >
      <div className="border-b border-border pb-4">
        <h3 className="font-dot text-base tracking-widest uppercase font-bold text-foreground">
          {title}
        </h3>
        {description && (
          <p className="text-xs text-secondary mt-1 tracking-wider leading-relaxed">
            {description}
          </p>
        )}
      </div>

      <div>{children}</div>
    </div>
  );
}

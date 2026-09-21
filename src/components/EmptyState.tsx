"use client";

import { ReactNode } from "react";
import { Disc3 } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="border border-border p-12 md:p-16 text-center space-y-4 bg-background max-w-lg mx-auto">
      <div className="w-12 h-12 border border-border mx-auto flex items-center justify-center text-secondary">
        <Disc3 className="w-6 h-6" />
      </div>
      <div className="space-y-1">
        <h3 className="font-dot text-base tracking-widest uppercase font-bold text-foreground">
          {title}
        </h3>
        <p className="font-mono text-xs text-secondary leading-relaxed">
          {description}
        </p>
      </div>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface ToastProps {
  message: string;
  type?: "info" | "success" | "error";
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type = "info", onClose, duration = 4000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const glyph = type === "success" ? "✓" : type === "error" ? "✕" : "●";

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 border border-foreground bg-foreground text-background px-4 py-3 font-mono text-xs uppercase tracking-wider select-none shadow-none">
      <span className="font-bold">{glyph}</span>
      <span>{message}</span>
      <button
        onClick={onClose}
        className="ml-2 text-background/70 hover:text-background"
        aria-label="Dismiss notification"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

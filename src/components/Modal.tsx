"use client";

import { useEffect, ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-none">
      <div className="fixed inset-0" onClick={onClose} />
      <div
        className={cn(
          "relative z-10 w-full max-w-lg border border-foreground bg-background p-6 md:p-8 space-y-6 font-mono shadow-none",
          className
        )}
      >
        <div className="flex items-center justify-between border-b border-border pb-4">
          <h3 className="font-dot text-base tracking-widest uppercase font-bold text-foreground">
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 border border-transparent hover:border-border text-secondary hover:text-foreground transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}

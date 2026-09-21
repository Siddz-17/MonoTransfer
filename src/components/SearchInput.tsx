"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder = "SEARCH...", className }: SearchInputProps) {
  return (
    <div className={cn("relative flex items-center w-full max-w-md", className)}>
      <Search className="w-4 h-4 absolute left-3.5 text-secondary pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-background border border-border pl-10 pr-9 py-2.5 text-xs font-mono uppercase tracking-wider text-foreground placeholder:text-secondary focus:border-foreground focus:outline-none transition-colors"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          aria-label="Clear Search"
          className="absolute right-3 text-secondary hover:text-foreground"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

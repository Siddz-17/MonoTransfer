"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxOption {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

interface CheckboxGroupProps {
  options: CheckboxOption[];
  className?: string;
}

export function CheckboxGroup({ options, className }: CheckboxGroupProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {options.map((opt) => (
        <label
          key={opt.id}
          className={cn(
            "flex items-start gap-4 p-4 border transition-all cursor-pointer select-none",
            opt.checked
              ? "border-foreground bg-foreground/5 dark:bg-foreground/5"
              : "border-border hover:border-foreground/50 bg-background"
          )}
        >
          <div
            className={cn(
              "w-5 h-5 border mt-0.5 flex items-center justify-center shrink-0 transition-colors",
              opt.checked
                ? "bg-foreground border-foreground text-background"
                : "border-secondary bg-background"
            )}
          >
            {opt.checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
          </div>
          <div className="space-y-1">
            <span className="font-mono text-xs uppercase tracking-wider font-semibold block text-foreground">
              {opt.label}
            </span>
            <p className="font-mono text-[11px] text-secondary leading-relaxed">
              {opt.description}
            </p>
          </div>
          <input
            type="checkbox"
            checked={opt.checked}
            onChange={(e) => opt.onChange(e.target.checked)}
            className="sr-only"
          />
        </label>
      ))}
    </div>
  );
}

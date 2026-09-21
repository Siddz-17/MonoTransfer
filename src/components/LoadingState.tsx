"use client";

interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = "PROCESSING DATA..." }: LoadingStateProps) {
  return (
    <div className="p-16 flex flex-col items-center justify-center space-y-4">
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 bg-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-2.5 h-2.5 bg-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-2.5 h-2.5 bg-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
      <p className="font-mono text-xs tracking-widest text-secondary uppercase">
        {label}
      </p>
    </div>
  );
}

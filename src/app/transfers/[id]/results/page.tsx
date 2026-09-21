"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { TransferResult } from "@/components/TransferResult";
import { LoadingState } from "@/components/LoadingState";
import { ArrowLeft } from "lucide-react";

export default function TransferResultPage() {
  const params = useParams();
  const id = params?.id as string;
  const [transfer, setTransfer] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/transfers/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.transfer) {
          setTransfer(data.transfer);
        }
      })
      .catch((err) => console.error("Error loading transfer result:", err))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <LoadingState label="FETCHING AUDIT METRICS..." />
      </div>
    );
  }

  if (!transfer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground font-mono">
        <div className="text-center space-y-4">
          <p className="text-secondary text-xs uppercase">TRANSFER NOT FOUND.</p>
          <Link href="/transfers" className="underline text-xs">RETURN TO TRANSFERS</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between p-6 md:p-12 font-mono">
      <header className="flex items-center justify-between border-b border-border pb-6 text-xs">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-secondary hover:text-foreground tracking-widest uppercase transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>RETURN TO DASHBOARD</span>
        </Link>
        <span className="text-secondary uppercase tracking-widest">
          STATUS: <span className="text-foreground font-bold">{transfer.status}</span>
        </span>
      </header>

      <main className="my-auto py-10">
        <TransferResult
          transferId={transfer.id}
          targetPlaylistName={transfer.targetPlaylistName}
          targetPlaylistId={transfer.targetPlaylistId}
          matchedCount={transfer.matchedCount}
          failedCount={transfer.failedCount}
          skippedCount={transfer.skippedCount}
          totalTracks={transfer.totalTracks}
        />
      </main>

      <footer className="border-t border-border pt-6 text-center text-[10px] text-secondary tracking-widest uppercase">
        TRANSFER COMPLETED // RECORD LOGGED TO AUDIT LOG
      </footer>
    </div>
  );
}

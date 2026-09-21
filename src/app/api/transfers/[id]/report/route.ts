import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { handleRouteError } from "@/lib/api-handler";

function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const transfer = await prisma.transfer.findFirst({
      where: { id, userId: session.userId },
      include: {
        items: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!transfer) {
      return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
    }

    const headers = [
      "Index",
      "Source Title",
      "Source Artist",
      "Source Album",
      "Duration (s)",
      "Explicit",
      "Status",
      "Matched Video ID",
      "Matched Title",
      "Matched Artist",
      "Confidence Score",
    ];

    const rows = transfer.items.map((item, idx) => [
      idx + 1,
      escapeCsv(item.title),
      escapeCsv(item.artist),
      escapeCsv(item.album || ""),
      Math.round(item.durationMs / 1000),
      item.isExplicit ? "YES" : "NO",
      item.status,
      escapeCsv(item.targetVideoId || ""),
      escapeCsv(item.targetTitle || ""),
      escapeCsv(item.targetArtist || ""),
      item.confidenceScore !== null ? item.confidenceScore.toFixed(3) : "",
    ]);

    const csvContent = [
      `# MonoTransfer Report: ${transfer.targetPlaylistName}`,
      `# Exported: ${new Date().toISOString()}`,
      `# Status: ${transfer.status} (Matched: ${transfer.matchedCount}, Failed: ${transfer.failedCount}, Skipped: ${transfer.skippedCount})`,
      headers.join(","),
      ...rows.map((r) => r.join(",")),
    ].join("\n");

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="monotransfer-${id}.csv"`,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

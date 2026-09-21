import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { handleRouteError } from "@/lib/api-handler";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const transfer = await prisma.transfer.findFirst({
      where: {
        id,
        userId: session.userId,
      },
      include: {
        sourcePlaylist: {
          select: {
            name: true,
            imageUrl: true,
          },
        },
        items: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!transfer) {
      return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
    }

    const processed = transfer.matchedCount + transfer.failedCount + transfer.skippedCount;
    const progressPercent = transfer.totalTracks > 0
      ? Math.min(100, Math.round((processed / transfer.totalTracks) * 100))
      : 0;

    return NextResponse.json({
      transfer: {
        ...transfer,
        progressPercent,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

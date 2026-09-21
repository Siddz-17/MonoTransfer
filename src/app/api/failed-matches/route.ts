import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { handleRouteError } from "@/lib/api-handler";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const transferId = searchParams.get("transferId");

    const whereClause: any = {
      transfer: { userId: session.userId },
    };

    if (transferId) {
      whereClause.transferId = transferId;
    }

    const failedMatches = await prisma.failedMatch.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: {
        transfer: {
          select: {
            id: true,
            targetPlaylistName: true,
          },
        },
      },
    });

    return NextResponse.json({ failedMatches });
  } catch (error) {
    return handleRouteError(error);
  }
}

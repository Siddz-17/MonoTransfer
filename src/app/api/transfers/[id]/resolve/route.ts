import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { handleRouteError } from "@/lib/api-handler";
import { ItemStatus } from "@prisma/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id: transferId } = await params;
    const body = await request.json();
    const { itemId, targetVideoId, targetTitle, targetArtist } = body;

    if (!itemId || !targetVideoId) {
      return NextResponse.json({ error: "itemId and targetVideoId are required" }, { status: 400 });
    }

    const transfer = await prisma.transfer.findFirst({
      where: { id: transferId, userId: session.userId },
    });

    if (!transfer) {
      return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
    }

    const item = await prisma.transferItem.findFirst({
      where: { id: itemId, transferId },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Update item to matched with chosen target
    const updated = await prisma.transferItem.update({
      where: { id: itemId },
      data: {
        targetVideoId,
        targetTitle: targetTitle || item.targetTitle,
        targetArtist: targetArtist || item.targetArtist,
        status: ItemStatus.MATCHED,
        isOfficialChannel: true,
        confidenceScore: 1.0,
        resolvedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, item: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}

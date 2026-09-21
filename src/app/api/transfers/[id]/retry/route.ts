import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { handleRouteError } from "@/lib/api-handler";
import { enqueueTransferJob } from "@/server/queue";
import { TransferStatus, ItemStatus } from "@prisma/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const transfer = await prisma.transfer.findFirst({
      where: { id, userId: session.userId },
      include: { items: true },
    });

    if (!transfer) {
      return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
    }

    // Reset failed items back to PENDING
    const failedItems = transfer.items.filter((i) => i.status === ItemStatus.FAILED);
    if (failedItems.length > 0) {
      await prisma.transferItem.updateMany({
        where: {
          transferId: id,
          status: ItemStatus.FAILED,
        },
        data: {
          status: ItemStatus.PENDING,
        },
      });

      await prisma.transfer.update({
        where: { id },
        data: {
          status: TransferStatus.PENDING,
          failedCount: 0,
        },
      });
    }

    try {
      await enqueueTransferJob(id);
    } catch (err: any) {
      console.warn("Could not enqueue retry job:", err.message);
    }

    return NextResponse.json({ success: true, retriedCount: failedItems.length });
  } catch (error) {
    return handleRouteError(error);
  }
}

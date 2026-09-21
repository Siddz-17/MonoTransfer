import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { handleRouteError } from "@/lib/api-handler";
import { createRedisClient } from "@/lib/redis";
import { TransferStatus, AuditAction } from "@prisma/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const transfer = await prisma.transfer.findFirst({
      where: { id, userId: session.userId },
    });

    if (!transfer) {
      return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
    }

    if (transfer.status === TransferStatus.COMPLETED || transfer.status === TransferStatus.CANCELLED) {
      return NextResponse.json({ error: `Cannot cancel transfer in ${transfer.status} state` }, { status: 400 });
    }

    await prisma.transfer.update({
      where: { id },
      data: {
        status: TransferStatus.CANCELLED,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: AuditAction.TRANSFER_CANCELLED,
        metadata: JSON.stringify({ transferId: id }),
      },
    });

    // Notify WebSocket subscribers immediately
    try {
      const pub = createRedisClient();
      await pub.publish(
        `transfer:${id}:progress`,
        JSON.stringify({
          transferId: id,
          status: "CANCELLED",
          message: "Transfer cancelled by user.",
        })
      );
      await pub.quit();
    } catch (e: any) {
      console.warn("Could not publish cancel to Redis:", e.message);
    }

    return NextResponse.json({ success: true, status: "CANCELLED" });
  } catch (error) {
    return handleRouteError(error);
  }
}

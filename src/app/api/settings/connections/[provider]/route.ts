import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { handleRouteError } from "@/lib/api-handler";
import { Provider, AuditAction } from "@prisma/client";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const session = await requireSession();
    const { provider } = await params;
    const provEnum = provider.toUpperCase() as Provider;

    if (!Object.values(Provider).includes(provEnum)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    await prisma.connection.deleteMany({
      where: {
        userId: session.userId,
        provider: provEnum,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: AuditAction.DISCONNECT,
        metadata: JSON.stringify({ provider: provEnum }),
      },
    });

    return NextResponse.json({ success: true, message: `Disconnected ${provEnum}` });
  } catch (error) {
    return handleRouteError(error);
  }
}

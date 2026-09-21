import { NextResponse } from "next/server";
import { requireSession, clearSessionCookie } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { handleRouteError } from "@/lib/api-handler";
import { AuditAction } from "@prisma/client";

export async function DELETE() {
  try {
    const session = await requireSession();

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: AuditAction.ACCOUNT_DELETED,
        metadata: JSON.stringify({ userId: session.userId, email: session.email }),
      },
    });

    // Cascade deletes all connections, playlists, transfers, items, failedMatches
    await prisma.user.delete({
      where: { id: session.userId },
    });

    await clearSessionCookie();

    return NextResponse.json({ success: true, message: "Account deleted permanently" });
  } catch (error) {
    return handleRouteError(error);
  }
}

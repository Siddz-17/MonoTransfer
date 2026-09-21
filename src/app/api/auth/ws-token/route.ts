import { NextRequest, NextResponse } from "next/server";
import { requireSession, signWsToken } from "@/lib/session";
import { handleRouteError } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const transferId = searchParams.get("transferId");

    if (!transferId) {
      return NextResponse.json({ error: "transferId is required" }, { status: 400 });
    }

    const transfer = await prisma.transfer.findUnique({
      where: { id: transferId },
      select: { userId: true },
    });

    if (!transfer || transfer.userId !== session.userId) {
      return NextResponse.json({ error: "Transfer not found or unauthorized" }, { status: 404 });
    }

    const token = signWsToken(session.userId, transferId);
    let wsUrl = "";

    if (process.env.NEXT_PUBLIC_WS_URL) {
      const base = process.env.NEXT_PUBLIC_WS_URL.replace(/\/$/, "");
      wsUrl = `${base}?transferId=${transferId}&token=${token}`;
    } else {
      const proto = request.headers.get("x-forwarded-proto") === "https" ? "wss" : "ws";
      const host = request.headers.get("host")?.split(":")[0] || "localhost";
      const isLocal = host === "localhost" || host === "127.0.0.1";
      const port = isLocal ? `:${process.env.WS_PORT || "3001"}` : "";
      wsUrl = `${proto}://${host}${port}?transferId=${transferId}&token=${token}`;
    }

    return NextResponse.json({
      token,
      wsUrl,
      expiresIn: 120, // 2 minutes
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

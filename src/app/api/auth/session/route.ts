import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { handleRouteError } from "@/lib/api-handler";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ authenticated: false, user: null, connections: [] });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        connections: {
          select: {
            provider: true,
            providerUserId: true,
            expiresAt: true,
            createdAt: true,
          },
        },
        preference: true,
      },
    });

    if (!user) {
      return NextResponse.json({ authenticated: false, user: null, connections: [] });
    }

    const hasSpotify = user.connections.some((c) => c.provider === "SPOTIFY");
    const hasGoogle = user.connections.some((c) => c.provider === "GOOGLE");

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      connections: {
        spotify: hasSpotify,
        google: hasGoogle,
      },
      preferences: user.preference,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { handleRouteError } from "@/lib/api-handler";

export async function GET() {
  try {
    const session = await requireSession();
    let pref = await prisma.transferPreference.findUnique({
      where: { userId: session.userId },
    });

    if (!pref) {
      pref = await prisma.transferPreference.create({
        data: { userId: session.userId },
      });
    }

    return NextResponse.json({ preferences: pref });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = await request.json();

    const updated = await prisma.transferPreference.upsert({
      where: { userId: session.userId },
      update: {
        skipDuplicates: body.skipDuplicates !== undefined ? Boolean(body.skipDuplicates) : undefined,
        retryFailedMatches: body.retryFailedMatches !== undefined ? Boolean(body.retryFailedMatches) : undefined,
        matchExplicitVersions: body.matchExplicitVersions !== undefined ? Boolean(body.matchExplicitVersions) : undefined,
        matchLiveVersions: body.matchLiveVersions !== undefined ? Boolean(body.matchLiveVersions) : undefined,
        privatePlaylist: body.privatePlaylist !== undefined ? Boolean(body.privatePlaylist) : undefined,
        minimumConfidenceThreshold: body.minimumConfidenceThreshold !== undefined ? Number(body.minimumConfidenceThreshold) : undefined,
      },
      create: {
        userId: session.userId,
        skipDuplicates: body.skipDuplicates ?? true,
        retryFailedMatches: body.retryFailedMatches ?? true,
        matchExplicitVersions: body.matchExplicitVersions ?? true,
        matchLiveVersions: body.matchLiveVersions ?? false,
        privatePlaylist: body.privatePlaylist ?? true,
        minimumConfidenceThreshold: body.minimumConfidenceThreshold ?? 0.72,
      },
    });

    return NextResponse.json({ preferences: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}

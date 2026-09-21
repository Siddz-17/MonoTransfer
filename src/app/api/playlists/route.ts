import { NextRequest, NextResponse } from "next/server";
import { requireSession, getValidAccessToken } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { handleRouteError } from "@/lib/api-handler";
import { Provider } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);

    const query = searchParams.get("q") || "";
    const sortBy = searchParams.get("sortBy") || "name";
    const sortOrder = (searchParams.get("sortOrder") || "asc") as "asc" | "desc";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, Math.min(50, parseInt(searchParams.get("limit") || "12", 10)));
    const refresh = searchParams.get("refresh") === "true";

    // If refresh requested, attempt to fetch from Spotify API
    if (refresh) {
      try {
        const token = await getValidAccessToken(session.userId, Provider.SPOTIFY);
        const res = await fetch("https://api.spotify.com/v1/me/playlists?limit=50", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          for (const item of data.items || []) {
            await prisma.playlist.upsert({
              where: {
                userId_spotifyId: {
                  userId: session.userId,
                  spotifyId: item.id,
                },
              },
              update: {
                name: item.name || "Untitled Playlist",
                description: item.description || null,
                trackCount: item.tracks?.total || 0,
                imageUrl: item.images?.[0]?.url || null,
                snapshotId: item.snapshot_id || null,
              },
              create: {
                userId: session.userId,
                spotifyId: item.id,
                name: item.name || "Untitled Playlist",
                description: item.description || null,
                trackCount: item.tracks?.total || 0,
                imageUrl: item.images?.[0]?.url || null,
                snapshotId: item.snapshot_id || null,
              },
            });
          }
        }
      } catch (e: any) {
        console.warn("[Playlists] Refresh from Spotify skipped/failed:", e.message);
      }
    }

    const whereClause: any = {
      userId: session.userId,
    };

    if (query) {
      whereClause.name = {
        contains: query,
        mode: "insensitive",
      };
    }

    const orderBy: any = {};
    if (sortBy === "trackCount") {
      orderBy.trackCount = sortOrder;
    } else {
      orderBy.name = sortOrder;
    }

    const [total, playlists] = await Promise.all([
      prisma.playlist.count({ where: whereClause }),
      prisma.playlist.findMany({
        where: whereClause,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      playlists,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      limit,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

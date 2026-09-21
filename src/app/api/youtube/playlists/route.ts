import { NextResponse } from "next/server";
import { requireSession, getValidAccessToken } from "@/lib/session";
import { handleRouteError } from "@/lib/api-handler";
import { Provider } from "@prisma/client";

export async function GET() {
  try {
    const session = await requireSession();

    let accessToken: string | null = null;
    try {
      accessToken = await getValidAccessToken(session.userId, Provider.GOOGLE);
    } catch {
      // Not connected to Google or in demo
    }

    if (!accessToken) {
      // Return sample mock playlists for development/demo mode
      return NextResponse.json({
        playlists: [
          { id: "mock_yt_pl_favorites", title: "FAVORITES // 2026", itemCount: 34 },
          { id: "mock_yt_pl_workout", title: "WORKOUT // ELECTRONIC", itemCount: 18 },
          { id: "mock_yt_pl_focus", title: "DEEP FOCUS & CODE", itemCount: 52 },
        ],
      });
    }

    const res = await fetch("https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=50", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      if (res.status === 403) {
        const txt = await res.text();
        if (txt.includes("quotaExceeded")) {
          const err = new Error("YouTubeQuotaError: API quota limit reached");
          err.name = "YouTubeQuotaError";
          throw err;
        }
      }
      throw new Error(`YouTube API returned ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    const playlists = (data.items || []).map((item: any) => ({
      id: item.id,
      title: item.snippet?.title || "Untitled Playlist",
      itemCount: item.contentDetails?.itemCount || 0,
    }));

    return NextResponse.json({ playlists });
  } catch (error) {
    return handleRouteError(error);
  }
}

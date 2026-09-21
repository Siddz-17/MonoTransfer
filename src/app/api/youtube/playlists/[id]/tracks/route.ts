import { NextRequest, NextResponse } from "next/server";
import { requireSession, getValidAccessToken } from "@/lib/session";
import { handleRouteError } from "@/lib/api-handler";
import { Provider } from "@prisma/client";

function parseYouTubeTrackTitle(rawTitle: string, channelTitle?: string): { title: string; artist: string } {
  let cleanTitle = rawTitle.replace(/\s*\([^)]*\)|\s*\[[^\]]*\]/g, " ").trim();
  cleanTitle = cleanTitle.replace(/\s*(?:official video|official audio|music video|lyric video|lyrics|hd|4k)\s*/gi, " ").trim();

  if (cleanTitle.includes(" - ")) {
    const parts = cleanTitle.split(" - ");
    const artistPart = parts[0].trim();
    const titlePart = parts.slice(1).join(" - ").trim();
    return {
      artist: artistPart || channelTitle || "Unknown Artist",
      title: titlePart || cleanTitle,
    };
  }

  return {
    artist: channelTitle?.replace(/\s*-\s*topic$/i, "").trim() || "Unknown Artist",
    title: cleanTitle,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    let accessToken: string | null = null;
    try {
      accessToken = await getValidAccessToken(session.userId, Provider.GOOGLE);
    } catch {
      // not linked
    }

    if (!accessToken) {
      return NextResponse.json({
        tracks: [
          { id: "mock_trk_1", title: "Starboy", artist: "The Weeknd", videoId: "34Na4j8AVgA" },
          { id: "mock_trk_2", title: "Levitating", artist: "Dua Lipa", videoId: "TUVcZfQe-Kw" },
          { id: "mock_trk_3", title: "Save Your Tears", artist: "The Weeknd", videoId: "XXYlFuWEuKI" },
        ],
      });
    }

    const allItems: any[] = [];
    let nextPageToken: string | null = null;
    let pageCount = 0;

    do {
      pageCount++;
      const url: string = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${id}&maxResults=50${
        nextPageToken ? `&pageToken=${nextPageToken}` : ""
      }`;

      const res: Response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        break;
      }

      const data: any = await res.json();
      const items = data.items || [];
      allItems.push(...items);
      nextPageToken = data.nextPageToken || null;
    } while (nextPageToken && pageCount < 5);

    const tracks = allItems.map((item: any, idx: number) => {
      const snippet = item.snippet;
      const rawTitle = snippet?.title || "Unknown Title";
      const channel = snippet?.videoOwnerChannelTitle || snippet?.channelTitle || "";
      const parsed = parseYouTubeTrackTitle(rawTitle, channel);

      return {
        id: item.id || `yt_item_${idx}`,
        title: parsed.title,
        artist: parsed.artist,
        videoId: item.contentDetails?.videoId || snippet?.resourceId?.videoId || "",
        position: idx,
      };
    }).filter(t => Boolean(t.videoId));

    return NextResponse.json({ tracks, total: tracks.length });
  } catch (error) {
    return handleRouteError(error);
  }
}

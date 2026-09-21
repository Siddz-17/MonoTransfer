import { Candidate, TrackInput } from "./scoring";

const YTMUSIC_SERVICE_URL = process.env.YTMUSIC_SERVICE_URL || "http://localhost:8000";

interface YtMusicServiceResponse {
  query: string;
  count: number;
  candidates: Array<{
    videoId: string;
    title: string;
    artists: string[];
    album?: string | null;
    durationSeconds?: number | null;
    isExplicit?: boolean;
    source?: string;
  }>;
}

/**
 * Searches the internal Python ytmusicapi microservice.
 */
async function searchYtMusicService(query: string): Promise<Candidate[]> {
  const url = `${YTMUSIC_SERVICE_URL}/search?q=${encodeURIComponent(query)}&limit=10`;
  const res = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(4500),
  });

  if (!res.ok) {
    throw new Error(`ytmusic-service returned ${res.status}: ${res.statusText}`);
  }

  const data: YtMusicServiceResponse = await res.json();
  return (data.candidates || []).map((item) => ({
    videoId: item.videoId,
    title: item.title,
    artists: item.artists || [],
    album: item.album || null,
    durationSeconds: item.durationSeconds || null,
    isExplicit: Boolean(item.isExplicit),
    source: "ytmusicapi",
  }));
}

/**
 * Fallback search via YouTube Data API v3 (search.list).
 * Scored with a lower confidence ceiling since general YouTube results are noisier.
 */
async function searchYouTubeDataApi(query: string, googleAccessToken?: string): Promise<Candidate[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey && !googleAccessToken) {
    return [];
  }

  let endpoint = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=8&q=${encodeURIComponent(query)}`;
  const headers: Record<string, string> = {};

  if (googleAccessToken) {
    headers["Authorization"] = `Bearer ${googleAccessToken}`;
  } else if (apiKey) {
    endpoint += `&key=${apiKey}`;
  }

  const res = await fetch(endpoint, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    if (res.status === 403) {
      const body = await res.text();
      if (body.includes("quotaExceeded")) {
        const err = new Error("YouTubeQuotaError: API quota limit reached");
        err.name = "YouTubeQuotaError";
        throw err;
      }
    }
    throw new Error(`YouTube Data API returned ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();
  const items = data.items || [];

  return items.map((item: any) => {
    const title = item.snippet?.title || "";
    const channelTitle = item.snippet?.channelTitle || "";
    return {
      videoId: item.id?.videoId || "",
      title,
      artists: [channelTitle],
      album: null,
      durationSeconds: null, // search.list doesn't return contentDetails duration
      isExplicit: false,
      source: "youtube_data_api_fallback",
    };
  }).filter((c: Candidate) => Boolean(c.videoId));
}

/**
 * High-fidelity candidate gathering with seamless fallback.
 */
export async function gatherCandidates(
  track: TrackInput,
  options?: { googleAccessToken?: string }
): Promise<Candidate[]> {
  const query = `${track.artist} ${track.title}`.trim();

  // 1. Primary: ytmusicapi microservice
  try {
    const candidates = await searchYtMusicService(query);
    if (candidates && candidates.length > 0) {
      return candidates;
    }
  } catch (err: any) {
    console.warn(`[Matcher] ytmusic-service unavailable or failed for "${query}": ${err.message}. Falling back to YouTube Data API.`);
  }

  // 2. Secondary fallback: YouTube Data API v3
  try {
    const fallbackCandidates = await searchYouTubeDataApi(query, options?.googleAccessToken);
    if (fallbackCandidates && fallbackCandidates.length > 0) {
      return fallbackCandidates;
    }
  } catch (err: any) {
    if (err.name === "YouTubeQuotaError") {
      throw err;
    }
    console.warn(`[Matcher] YouTube Data API fallback failed: ${err.message}`);
  }

  // 3. Synthetic/deterministic fallback candidate for testing/sandbox
  return [
    {
      videoId: `yt_mock_${Buffer.from(query).toString("base64url").slice(0, 11)}`,
      title: track.title,
      artists: [track.artist],
      album: track.album || null,
      durationSeconds: Math.round(track.durationMs / 1000),
      isExplicit: track.isExplicit,
      source: "synthetic_catalog",
    },
  ];
}

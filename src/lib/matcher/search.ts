import { Candidate, TrackInput } from "./scoring";

/**
 * Sanitize the ytmusic service URL: ensure it has a http:// or https:// scheme.
 * On Render, internal service names like "monotransfer-ytmusic" are sometimes set
 * without a protocol prefix, causing "Failed to parse URL" errors at runtime.
 */
function sanitizeServiceUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "http://localhost:8000";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

const YTMUSIC_SERVICE_URL = sanitizeServiceUrl(
  process.env.YTMUSIC_SERVICE_URL || "http://localhost:8000"
);

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
    channelTitle?: string | null;
    channelId?: string | null;
    isOfficialChannel?: boolean;
    isSong?: boolean;
    isrc?: string | null;
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
    channelTitle: item.channelTitle || null,
    channelId: item.channelId || null,
    isOfficialChannel: Boolean(item.isOfficialChannel),
    isSong: Boolean(item.isSong),
    isrc: item.isrc || null,
  }));
}

/**
 * Global serialized queue for YouTube Data API search requests.
 * Prevents 429 (Too Many Requests) caused by 3 concurrent tracks all firing
 * YouTube API calls at the same moment. Enforces 1.2s between each request.
 */
let ytDataApiQueue: Promise<void> = Promise.resolve();

function queueYouTubeDataApiSearch<T>(operation: () => Promise<T>): Promise<T> {
  const next = ytDataApiQueue.then(async () => {
    await new Promise((r) => setTimeout(r, 1200));
    return operation();
  });
  ytDataApiQueue = next.then(
    () => {},
    () => {}
  );
  return next;
}

/**
 * Fallback search via YouTube Data API v3 (search.list).
 * Serialized to avoid 429s from concurrent track processing.
 * Retries once with 3s backoff on 429 before giving up.
 */
async function searchYouTubeDataApi(
  query: string,
  sourceArtist: string,
  googleAccessToken?: string
): Promise<Candidate[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey && !googleAccessToken) {
    return [];
  }

  return queueYouTubeDataApiSearch(async () => {
    const makeRequest = async (retryDelay = 0): Promise<Candidate[]> => {
      if (retryDelay > 0) {
        await new Promise((r) => setTimeout(r, retryDelay));
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
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        if (res.status === 429) {
          if (retryDelay === 0) {
            console.warn(`[Matcher] YouTube Data API 429 for "${query}" — retrying in 3s`);
            return makeRequest(3000);
          }
          throw new Error(`YouTube Data API returned 429: Too Many Requests (after retry)`);
        }
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
      const normSource = sourceArtist.toLowerCase().trim();

      return (items.map((item: any) => {
        const title = item.snippet?.title || "";
        const channelTitle = item.snippet?.channelTitle || "";
        const chLower = channelTitle.toLowerCase();
        const isOfficial =
          chLower.includes(" - topic") ||
          chLower.includes("vevo") ||
          chLower.includes("official") ||
          chLower === normSource ||
          chLower.includes(normSource);

        return {
          videoId: item.id?.videoId || "",
          title,
          artists: [channelTitle],
          album: null,
          durationSeconds: null,
          isExplicit: false,
          source: "youtube_data_api_fallback",
          channelTitle,
          channelId: item.snippet?.channelId || null,
          isOfficialChannel: isOfficial,
          isSong: false,
        };
      }) as Candidate[]).filter((c: Candidate) => Boolean(c.videoId));
    };

    return makeRequest();
  });
}

/**
 * High-fidelity candidate gathering with ISRC-first prioritization,
 * official artist channel targeting, and seamless fallbacks.
 */
export async function gatherCandidates(
  track: TrackInput,
  options?: { googleAccessToken?: string }
): Promise<Candidate[]> {
  const allCandidates: Candidate[] = [];
  const seenVideoIds = new Set<string>();

  const addUnique = (list: Candidate[]) => {
    for (const c of list) {
      if (c.videoId && !seenVideoIds.has(c.videoId)) {
        seenVideoIds.add(c.videoId);
        allCandidates.push(c);
      }
    }
  };

  // 1. ISRC exact search if ISRC code is available
  if (track.isrc) {
    try {
      const isrcCandidates = await searchYtMusicService(track.isrc.trim());
      if (isrcCandidates.length > 0) {
        addUnique(isrcCandidates.map(c => ({ ...c, isrc: track.isrc })));
      }
    } catch (err: any) {
      console.warn(`[Matcher] ISRC search skipped for "${track.isrc}":`, err.message);
    }
  }

  // 2. Primary track title + artist search
  const query = `${track.artist} ${track.title}`.trim();
  try {
    const primaryCandidates = await searchYtMusicService(query);
    addUnique(primaryCandidates);
  } catch (err: any) {
    console.warn(`[Matcher] ytmusic-service error for "${query}": ${err.message}.`);
  }

  // 3. If no official candidate found yet, search specifically for official artist upload
  const hasOfficial = allCandidates.some(c => c.isOfficialChannel || c.isSong);
  if (!hasOfficial && track.artist) {
    try {
      const officialQuery = `${track.artist} ${track.title} official`;
      const officialCandidates = await searchYtMusicService(officialQuery);
      addUnique(officialCandidates);
    } catch (err: any) {
      // ignore
    }
  }

  if (allCandidates.length > 0) {
    return allCandidates;
  }

  // 4. Secondary fallback: YouTube Data API v3 (uses user OAuth token or API key from env).
  // This is the primary fallback when the ytmusic-service Python microservice is not running.
  try {
    const fallbackCandidates = await searchYouTubeDataApi(query, track.artist, options?.googleAccessToken);
    addUnique(fallbackCandidates);
    if (allCandidates.length > 0) {
      console.log(`[Matcher] Using YouTube Data API fallback for "${query}" (${allCandidates.length} results)`);
      return allCandidates;
    }
  } catch (err: any) {
    if (err.name === "YouTubeQuotaError") {
      throw err;
    }
    console.warn(`[Matcher] YouTube Data API fallback failed: ${err.message}`);
  }

  // 5. No real candidates found — return empty array.
  // IMPORTANT: Never return synthetic/mock videoIds. Fake IDs like "yt_mock_xxx" cause
  // silent 400/404 failures when inserted into YouTube playlists, resulting in 0 songs added.
  console.warn(`[Matcher] No candidates found for "${query}" — track will be marked as failed.`);
  return [];
}

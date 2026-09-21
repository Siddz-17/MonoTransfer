import { Candidate, TrackInput } from "./scoring";

// ─────────────────────────────────────────────────────────────────────────────
// Direct YouTube Music Internal API
// Replicates what ytmusicapi Python library does under the hood.
// music.youtube.com/youtubei/v1/search — no quota, no cold starts, no service.
// ─────────────────────────────────────────────────────────────────────────────

const YTM_API_KEY = "AIzaSyC9XL3ZjWddXya6X74dJoCTL-NKNELL6Cs";
const YTM_CLIENT_VERSION = "1.20240101.01.00";
const SONGS_FILTER_PARAMS = "EgWKAQIIAWoKEAoQAxAEEAkQBQ==";

function ytmContext() {
  return {
    client: {
      clientName: "WEB_REMIX",
      clientVersion: YTM_CLIENT_VERSION,
      hl: "en",
      gl: "US",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      timeZone: "UTC",
      utcOffsetMinutes: 0,
    },
  };
}

function parseRunsText(runs: any[]): string {
  if (!Array.isArray(runs)) return "";
  return runs.map((r: any) => r.text || "").join("");
}

function parseDurationToSeconds(text: string): number | null {
  if (!text) return null;
  const parts = text.trim().split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function parseMusicItem(item: any): Candidate | null {
  const renderer = item?.musicResponsiveListItemRenderer;
  if (!renderer) return null;

  const videoId =
    renderer.playlistItemData?.videoId ||
    renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]
      ?.navigationEndpoint?.watchEndpoint?.videoId ||
    renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
      ?.playNavigationEndpoint?.watchEndpoint?.videoId;

  if (!videoId || videoId.startsWith("RDAMVM")) return null;

  const titleRuns =
    renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  const title = parseRunsText(titleRuns);
  if (!title) return null;

  const subtitleRuns: any[] =
    renderer.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];

  const artists: string[] = [];
  let album: string | null = null;
  let durationSeconds: number | null = null;
  let channelId: string | null = null;

  for (const run of subtitleRuns) {
    const text = (run.text || "").trim();
    if (!text || text === "\u2022") continue;
    const browseId = run.navigationEndpoint?.browseEndpoint?.browseId as string | undefined;
    if (browseId) {
      if (browseId.startsWith("UC") || browseId.startsWith("MPLA")) {
        artists.push(text);
        if (!channelId) channelId = browseId;
      } else if (browseId.startsWith("MPREb")) {
        album = text;
      }
    } else if (/^\d+:\d+/.test(text)) {
      durationSeconds = parseDurationToSeconds(text);
    }
  }

  const badges: any[] = renderer.badges || [];
  const isExplicit = badges.some(
    (b: any) => b.musicInlineBadgeRenderer?.icon?.iconType === "MUSIC_EXPLICIT_BADGE"
  );

  const channelTitle = artists[0] || null;
  const isOfficialChannel = Boolean(
    channelId?.startsWith("UC") ||
    channelTitle?.toLowerCase().includes("vevo") ||
    channelTitle?.toLowerCase().includes("official")
  );

  return {
    videoId, title, artists, album, durationSeconds, isExplicit,
    source: "ytmusic_direct", channelTitle, channelId: channelId || null,
    isOfficialChannel, isSong: true,
  };
}

function extractItems(data: any): any[] {
  const items: any[] = [];
  try {
    const tabs = data?.contents?.tabbedSearchResultsRenderer?.tabs;
    if (tabs) {
      const sections = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
      for (const section of sections) items.push(...(section?.musicShelfRenderer?.contents || []));
    }
    if (items.length === 0) {
      const sections = data?.contents?.sectionListRenderer?.contents || [];
      for (const section of sections) items.push(...(section?.musicShelfRenderer?.contents || []));
    }
  } catch { }
  return items;
}

async function searchYouTubeMusicDirect(
  query: string, useSongsFilter = true, limit = 10
): Promise<Candidate[]> {
  const body: any = { context: ytmContext(), query };
  if (useSongsFilter) body.params = SONGS_FILTER_PARAMS;

  const res = await fetch(
    `https://music.youtube.com/youtubei/v1/search?key=${YTM_API_KEY}&prettyPrint=false`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-YouTube-Client-Name": "67",
        "X-YouTube-Client-Version": YTM_CLIENT_VERSION,
        Origin: "https://music.youtube.com",
        Referer: "https://music.youtube.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000),
    }
  );

  if (!res.ok) throw new Error(`YouTube Music API ${res.status}: ${res.statusText}`);

  const data = await res.json();
  const rawItems = extractItems(data);
  const candidates: Candidate[] = [];
  for (const item of rawItems.slice(0, limit)) {
    const candidate = parseMusicItem(item);
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

let ytDataApiQueue: Promise<void> = Promise.resolve();

function queueYouTubeDataApiSearch<T>(operation: () => Promise<T>): Promise<T> {
  const next = ytDataApiQueue.then(async () => {
    await new Promise((r) => setTimeout(r, 2500));
    return operation();
  });
  ytDataApiQueue = next.then(() => {}, () => {});
  return next;
}

async function searchYouTubeDataApi(
  query: string, sourceArtist: string, googleAccessToken?: string
): Promise<Candidate[]> {
  if (!googleAccessToken) return [];
  return queueYouTubeDataApiSearch(async () => {
    const makeRequest = async (retryDelay = 0): Promise<Candidate[]> => {
      if (retryDelay > 0) await new Promise((r) => setTimeout(r, retryDelay));
      const endpoint = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${encodeURIComponent(query)}`;
      const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${googleAccessToken}` }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        if (res.status === 429) { if (retryDelay === 0) return makeRequest(10000); throw new Error("429 after retry"); }
        if (res.status === 403) { const b = await res.text(); if (b.includes("quotaExceeded")) { const e: any = new Error("YouTubeQuotaError"); e.name = "YouTubeQuotaError"; throw e; } }
        throw new Error(`YT Data API ${res.status}`);
      }
      const data = await res.json();
      const normSource = sourceArtist.toLowerCase().trim();
      return (data.items || []).map((item: any) => {
        const title = item.snippet?.title || "";
        const channelTitle = item.snippet?.channelTitle || "";
        const ch = channelTitle.toLowerCase();
        const isOfficial = ch.includes("- topic") || ch.includes("vevo") || ch.includes("official") || ch === normSource || ch.includes(normSource);
        return { videoId: item.id?.videoId || "", title, artists: [channelTitle], album: null, durationSeconds: null, isExplicit: false, source: "youtube_data_api_fallback", channelTitle, channelId: item.snippet?.channelId || null, isOfficialChannel: isOfficial, isSong: false } as Candidate;
      }).filter((c: Candidate) => Boolean(c.videoId));
    };
    return makeRequest();
  });
}

/**
 * No-op kept for API compatibility. Direct YTM API needs no warmup.
 */
export async function warmupYtMusicService(
  _timeoutMs?: number,
  _pollIntervalMs?: number
): Promise<boolean> {
  console.log("[Matcher] Direct YouTube Music API active — no warmup needed.");
  return true;
}

/**
 * Gathers candidates using YouTube Music's internal API directly.
 * No Python service, no quota limits, no cold starts.
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

  // 1. ISRC search (gold standard — exact match)
  if (track.isrc) {
    try {
      const isrcResults = await searchYouTubeMusicDirect(track.isrc.trim(), true, 5);
      if (isrcResults.length > 0) addUnique(isrcResults.map((c) => ({ ...c, isrc: track.isrc })));
    } catch (err: any) {
      console.warn(`[Matcher] ISRC search failed for "${track.isrc}": ${err.message}`);
    }
  }

  // 2. Primary: artist + title (songs filter)
  const query = `${track.artist} ${track.title}`.trim();
  try {
    const primary = await searchYouTubeMusicDirect(query, true, 10);
    addUnique(primary);
  } catch (err: any) {
    console.warn(`[Matcher] YTM search failed for "${query}": ${err.message}`);
  }

  // 3. General search if no official results yet
  const hasOfficial = allCandidates.some((c) => c.isOfficialChannel || c.isSong);
  if (!hasOfficial && track.artist) {
    try {
      const general = await searchYouTubeMusicDirect(query, false, 8);
      addUnique(general);
    } catch { }
  }

  if (allCandidates.length > 0) return allCandidates;

  // 4. YouTube Data API v3 last-resort fallback
  try {
    const fallback = await searchYouTubeDataApi(query, track.artist, options?.googleAccessToken);
    addUnique(fallback);
    if (allCandidates.length > 0) {
      console.log(`[Matcher] YT Data API fallback used for "${query}"`);
      return allCandidates;
    }
  } catch (err: any) {
    if (err.name === "YouTubeQuotaError") throw err;
    console.warn(`[Matcher] YT Data API fallback failed for "${query}": ${err.message}`);
  }

  console.warn(`[Matcher] No candidates found for "${query}"`);
  return [];
}

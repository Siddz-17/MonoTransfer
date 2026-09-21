import { diceCoefficient, normalizeArtist, normalizeTitle } from "./similarity";

export interface TrackInput {
  title: string;
  artist: string;
  album?: string | null;
  durationMs: number;
  isExplicit: boolean;
  isrc?: string | null;
}

export interface Candidate {
  videoId: string;
  title: string;
  artists: string[];
  album?: string | null;
  durationSeconds?: number | null;
  isExplicit: boolean;
  source?: string;
  channelTitle?: string | null;
  channelId?: string | null;
  isOfficialChannel?: boolean;
  isSong?: boolean;
  isrc?: string | null;
}

export interface ScoredCandidate extends Candidate {
  confidenceScore: number;
  titleScore: number;
  artistScore: number;
  durationScore: number;
  officialChannelScore: number;
  penaltyMultiplier: number;
  breakdown: string;
  isIsrcMatch?: boolean;
}

export interface MatcherOptions {
  matchLiveVersions: boolean;
  matchExplicitVersions: boolean;
  minimumConfidenceThreshold: number;
  isRetryPass?: boolean;
}

const LIVE_REGEX = /\b(?:live|concert|unplugged|in concert|at the|session)\b/i;
const REMIX_REGEX = /\b(?:remix|mashup|bootleg|flip|club mix|extended mix|dub)\b/i;
const COVER_REGEX = /\b(?:cover|tribute|originally performed by|acoustic cover|karaoke|instrumental cover)\b/i;
const UNOFFICIAL_MOD_REGEX = /\b(?:slowed|reverb|nightcore|8d audio|sped up|chopped and screwed|bass boosted)\b/i;

/**
 * Computes artist score comparing source artist with candidate artists array and channel metadata.
 */
function scoreArtist(sourceArtist: string, candidateArtists: string[], channelTitle?: string | null): number {
  const normSource = normalizeArtist(sourceArtist);
  let bestScore = 0.0;

  const allArtists = [...(candidateArtists || [])];
  if (channelTitle && !allArtists.includes(channelTitle)) {
    allArtists.push(channelTitle);
  }

  if (allArtists.length === 0) {
    return 0.35;
  }

  for (const rawCandidate of allArtists) {
    let normCand = normalizeArtist(rawCandidate);
    if (!normCand) continue;

    // Strip "- topic" suffix for comparison
    normCand = normCand.replace(/\s*-\s*topic$/i, "").trim();

    if (normCand === normSource) {
      return 1.0;
    }
    if (normCand.includes(normSource) || normSource.includes(normCand)) {
      bestScore = Math.max(bestScore, 0.90);
    } else {
      const dice = diceCoefficient(normSource, normCand);
      bestScore = Math.max(bestScore, dice);
    }
  }

  // Also check all candidate artists joined together
  const joinedCand = normalizeArtist(allArtists.join(" "));
  if (joinedCand.includes(normSource) || normSource.includes(joinedCand)) {
    bestScore = Math.max(bestScore, 0.85);
  }

  return bestScore;
}

/**
 * Computes duration score using linear falloff.
 */
function scoreDuration(sourceMs: number, candidateSeconds?: number | null): number {
  if (candidateSeconds === undefined || candidateSeconds === null || candidateSeconds <= 0 || sourceMs <= 0) {
    return 0.50;
  }

  const sourceSec = sourceMs / 1000;
  const diff = Math.abs(sourceSec - candidateSeconds);

  if (diff <= 2.0) return 1.0;
  if (diff >= 30.0) return 0.0;

  return 1.0 - ((diff - 2.0) / 28.0);
}

/**
 * Computes official channel bonus (0.0 to 1.0).
 * Checks OAC, Topic channel, and verified YouTube Music catalog releases.
 */
function scoreOfficialChannel(sourceArtist: string, candidate: Candidate): number {
  if (candidate.isSong) {
    return 1.0; // Official YouTube Music track
  }

  const normSource = normalizeArtist(sourceArtist);
  const ch = (candidate.channelTitle || "").toLowerCase();

  // Topic channel
  if (ch.endsWith(" - topic") || ch.includes(" - topic")) {
    const topicBase = normalizeArtist(ch.replace(/\s*-\s*topic/gi, ""));
    if (topicBase === normSource || topicBase.includes(normSource)) {
      return 1.0;
    }
    return 0.70;
  }

  // Official artist channel / Vevo
  if (candidate.isOfficialChannel || ch.includes("vevo") || ch.includes("official")) {
    if (ch.includes(normSource)) {
      return 1.0;
    }
    return 0.80;
  }

  // Channel title matches artist name directly
  const normCh = normalizeArtist(candidate.channelTitle || "");
  if (normCh && (normCh === normSource || normCh.includes(normSource))) {
    return 0.90;
  }

  return 0.0;
}

/**
 * Scores a single candidate using the user-approved weighted formula:
 * score = (title * 40%) + (artist * 30%) + (duration * 20%) + (official_channel_bonus * 10%)
 */
export function scoreCandidate(
  source: TrackInput,
  candidate: Candidate,
  options: MatcherOptions
): ScoredCandidate {
  // 0. Exact ISRC match bypass (Gold Standard: 100%)
  if (source.isrc && candidate.isrc && source.isrc.trim().toUpperCase() === candidate.isrc.trim().toUpperCase()) {
    return {
      ...candidate,
      confidenceScore: 1.0,
      titleScore: 1.0,
      artistScore: 1.0,
      durationScore: 1.0,
      officialChannelScore: 1.0,
      penaltyMultiplier: 1.0,
      isIsrcMatch: true,
      breakdown: "ISRC Exact Match (100%)",
    };
  }

  const normSourceTitle = normalizeTitle(source.title);
  const normCandTitle = normalizeTitle(candidate.title);

  // 1. Title similarity (weight 0.40)
  const titleScore = diceCoefficient(normSourceTitle, normCandTitle);

  // 2. Artist similarity (weight 0.30)
  const artistScore = scoreArtist(source.artist, candidate.artists, candidate.channelTitle);

  // 3. Duration similarity (weight 0.20)
  const durationScore = scoreDuration(source.durationMs, candidate.durationSeconds);

  // 4. Official channel bonus (weight 0.10)
  const officialChannelScore = scoreOfficialChannel(source.artist, candidate);

  // Weighted base score: 40% + 30% + 20% + 10%
  const baseScore =
    (titleScore * 0.40) +
    (artistScore * 0.30) +
    (durationScore * 0.20) +
    (officialChannelScore * 0.10);

  // 5. Post-weighting penalty multipliers
  let penaltyMultiplier = 1.0;
  const candidateText = `${candidate.title} ${candidate.artists.join(" ")} ${candidate.channelTitle || ""}`;

  // Live filter
  const sourceIsLive = LIVE_REGEX.test(source.title);
  const candidateIsLive = LIVE_REGEX.test(candidateText);
  if (!options.matchLiveVersions && !sourceIsLive && candidateIsLive) {
    penaltyMultiplier *= 0.20;
  }

  // Remix filter
  const sourceIsRemix = REMIX_REGEX.test(source.title);
  const candidateIsRemix = REMIX_REGEX.test(candidate.title);
  if (!sourceIsRemix && candidateIsRemix) {
    penaltyMultiplier *= 0.40;
  }

  // Cover / karaoke filter
  const sourceIsCover = COVER_REGEX.test(source.title);
  const candidateIsCover = COVER_REGEX.test(candidateText);
  if (!sourceIsCover && candidateIsCover) {
    penaltyMultiplier *= 0.20;
  }

  // Unofficial modifications (slowed, reverb, nightcore, 8d audio)
  if (!sourceIsRemix && UNOFFICIAL_MOD_REGEX.test(candidateText)) {
    penaltyMultiplier *= 0.30;
  }

  // Explicit version check
  if (options.matchExplicitVersions && source.isExplicit !== candidate.isExplicit) {
    penaltyMultiplier *= 0.75;
  }

  const finalConfidence = Math.min(1.0, Math.max(0.0, baseScore * penaltyMultiplier));

  return {
    ...candidate,
    confidenceScore: Math.round(finalConfidence * 1000) / 1000,
    titleScore: Math.round(titleScore * 1000) / 1000,
    artistScore: Math.round(artistScore * 1000) / 1000,
    durationScore: Math.round(durationScore * 1000) / 1000,
    officialChannelScore: Math.round(officialChannelScore * 1000) / 1000,
    penaltyMultiplier: Math.round(penaltyMultiplier * 1000) / 1000,
    breakdown: `T:${titleScore.toFixed(2)} A:${artistScore.toFixed(2)} D:${durationScore.toFixed(2)} OAC:${officialChannelScore.toFixed(2)} P:${penaltyMultiplier.toFixed(2)}`,
  };
}

export interface MatchResult {
  matched: boolean;
  bestMatch: ScoredCandidate | null;
  topCandidates: ScoredCandidate[];
  effectiveThreshold: number;
  hasMismatch?: boolean;
  mismatchReason?: string;
  suggestedMatch?: ScoredCandidate | null;
}

/**
 * Evaluates candidate list, ranks them, detects unofficial mismatches,
 * and smart-suggests official artist channel alternatives.
 */
export function evaluateCandidates(
  source: TrackInput,
  candidates: Candidate[],
  options: MatcherOptions
): MatchResult {
  const scored = candidates.map((c) => scoreCandidate(source, c, options));

  // Sort by confidenceScore desc, then by officialChannelScore desc
  scored.sort((a, b) => {
    if (b.confidenceScore !== a.confidenceScore) {
      return b.confidenceScore - a.confidenceScore;
    }
    return b.officialChannelScore - a.officialChannelScore;
  });

  const topCandidates = scored.slice(0, 5);

  let threshold = options.minimumConfidenceThreshold;
  if (options.isRetryPass) {
    threshold = Math.max(0.50, threshold - 0.15);
  }

  let best = topCandidates[0] || null;
  let hasMismatch = false;
  let mismatchReason: string | undefined;
  let suggestedMatch: ScoredCandidate | null = null;

  // Smart Mismatch Detection:
  // If top result is unofficial (e.g. RandomMusic123) but an official artist channel candidate exists
  if (best && best.officialChannelScore < 0.5) {
    const officialAlternative = topCandidates.find(
      (c) => c.videoId !== best?.videoId && c.officialChannelScore >= 0.7 && c.titleScore >= 0.70
    );

    if (officialAlternative) {
      hasMismatch = true;
      mismatchReason = `Found candidate from unofficial channel (${best.channelTitle || "Unknown"}). Suggested official artist release is available.`;
      suggestedMatch = officialAlternative;

      // Automatically elevate the official alternative if it meets threshold!
      if (officialAlternative.confidenceScore >= threshold - 0.05) {
        best = officialAlternative;
      }
    }
  }

  const isMatch = best !== null && best.confidenceScore >= threshold;

  return {
    matched: isMatch,
    bestMatch: isMatch ? best : null,
    topCandidates,
    effectiveThreshold: threshold,
    hasMismatch,
    mismatchReason,
    suggestedMatch,
  };
}

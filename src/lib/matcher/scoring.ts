import { diceCoefficient, normalizeArtist, normalizeTitle } from "./similarity";

export interface TrackInput {
  title: string;
  artist: string;
  album?: string | null;
  durationMs: number;
  isExplicit: boolean;
}

export interface Candidate {
  videoId: string;
  title: string;
  artists: string[];
  album?: string | null;
  durationSeconds?: number | null;
  isExplicit: boolean;
  source?: string;
}

export interface ScoredCandidate extends Candidate {
  confidenceScore: number;
  titleScore: number;
  artistScore: number;
  durationScore: number;
  penaltyMultiplier: number;
  breakdown: string;
}

export interface MatcherOptions {
  matchLiveVersions: boolean;
  matchExplicitVersions: boolean;
  minimumConfidenceThreshold: number;
  isRetryPass?: boolean;
}

const LIVE_REGEX = /\b(?:live|concert|unplugged|in concert|at the|session)\b/i;
const REMIX_REGEX = /\b(?:remix|mashup|bootleg|flip|club mix|extended mix|dub)\b/i;
const COVER_REGEX = /\b(?:cover|tribute|originally performed by|acoustic cover|karaoke)\b/i;

/**
 * Computes artist score comparing source artist with candidate artists array.
 */
function scoreArtist(sourceArtist: string, candidateArtists: string[]): number {
  if (!candidateArtists || candidateArtists.length === 0) {
    return 0.40; // Mild penalty, not disqualifying
  }

  const normSource = normalizeArtist(sourceArtist);
  let bestScore = 0.0;

  for (const rawCandidate of candidateArtists) {
    const normCand = normalizeArtist(rawCandidate);
    if (!normCand) continue;

    if (normCand === normSource) {
      return 1.0;
    }
    if (normCand.includes(normSource) || normSource.includes(normCand)) {
      bestScore = Math.max(bestScore, 0.85);
    } else {
      const dice = diceCoefficient(normSource, normCand);
      bestScore = Math.max(bestScore, dice);
    }
  }

  // Also check all candidate artists joined together
  const joinedCand = normalizeArtist(candidateArtists.join(" "));
  if (joinedCand.includes(normSource) || normSource.includes(joinedCand)) {
    bestScore = Math.max(bestScore, 0.85);
  }

  return bestScore;
}

/**
 * Computes duration score using linear falloff.
 * <= 2s diff: 1.0
 * >= 30s diff: 0.0
 * Between 2s and 30s: linear gradient
 */
function scoreDuration(sourceMs: number, candidateSeconds?: number | null): number {
  if (candidateSeconds === undefined || candidateSeconds === null || candidateSeconds <= 0 || sourceMs <= 0) {
    return 0.50; // Unknown duration: neutral 0.5
  }

  const sourceSec = sourceMs / 1000;
  const diff = Math.abs(sourceSec - candidateSeconds);

  if (diff <= 2.0) return 1.0;
  if (diff >= 30.0) return 0.0;

  return 1.0 - ((diff - 2.0) / 28.0);
}

/**
 * Scores a single candidate against the source track and transfer options.
 */
export function scoreCandidate(
  source: TrackInput,
  candidate: Candidate,
  options: MatcherOptions
): ScoredCandidate {
  const normSourceTitle = normalizeTitle(source.title);
  const normCandTitle = normalizeTitle(candidate.title);

  // 1. Title similarity (weight 0.50)
  const titleScore = diceCoefficient(normSourceTitle, normCandTitle);

  // 2. Artist similarity (weight 0.35)
  const artistScore = scoreArtist(source.artist, candidate.artists);

  // 3. Duration similarity (weight 0.15)
  const durationScore = scoreDuration(source.durationMs, candidate.durationSeconds);

  // Weighted base score
  const baseScore = (titleScore * 0.50) + (artistScore * 0.35) + (durationScore * 0.15);

  // 4. Post-weighting penalty multipliers
  let penaltyMultiplier = 1.0;
  const candidateText = `${candidate.title} ${candidate.artists.join(" ")}`;
  const sourceIsLive = LIVE_REGEX.test(source.title);
  const candidateIsLive = LIVE_REGEX.test(candidateText);

  if (!options.matchLiveVersions && !sourceIsLive && candidateIsLive) {
    penaltyMultiplier *= 0.15;
  }

  const sourceIsRemix = REMIX_REGEX.test(source.title);
  const candidateIsRemix = REMIX_REGEX.test(candidate.title);
  if (!sourceIsRemix && candidateIsRemix) {
    penaltyMultiplier *= 0.50;
  }

  const sourceIsCover = COVER_REGEX.test(source.title);
  const candidateIsCover = COVER_REGEX.test(candidate.title);
  if (!sourceIsCover && candidateIsCover) {
    penaltyMultiplier *= 0.20;
  }

  if (options.matchExplicitVersions && source.isExplicit !== candidate.isExplicit) {
    penaltyMultiplier *= 0.65;
  }

  const finalConfidence = Math.min(1.0, Math.max(0.0, baseScore * penaltyMultiplier));

  return {
    ...candidate,
    confidenceScore: Math.round(finalConfidence * 1000) / 1000,
    titleScore: Math.round(titleScore * 1000) / 1000,
    artistScore: Math.round(artistScore * 1000) / 1000,
    durationScore: Math.round(durationScore * 1000) / 1000,
    penaltyMultiplier: Math.round(penaltyMultiplier * 1000) / 1000,
    breakdown: `T:${titleScore.toFixed(2)} A:${artistScore.toFixed(2)} D:${durationScore.toFixed(2)} P:${penaltyMultiplier.toFixed(2)}`,
  };
}

export interface MatchResult {
  matched: boolean;
  bestMatch: ScoredCandidate | null;
  topCandidates: ScoredCandidate[];
  effectiveThreshold: number;
}

/**
 * Evaluates candidate list, ranks them, and decides whether a match clears the threshold.
 */
export function evaluateCandidates(
  source: TrackInput,
  candidates: Candidate[],
  options: MatcherOptions
): MatchResult {
  const scored = candidates.map((c) => scoreCandidate(source, c, options));
  scored.sort((a, b) => b.confidenceScore - a.confidenceScore);

  const topCandidates = scored.slice(0, 5);

  let threshold = options.minimumConfidenceThreshold;
  if (options.isRetryPass) {
    // Relaxed threshold for retry pass: max(0.5, threshold - 0.15)
    threshold = Math.max(0.50, threshold - 0.15);
  }

  const best = topCandidates[0] || null;
  const isMatch = best !== null && best.confidenceScore >= threshold;

  return {
    matched: isMatch,
    bestMatch: isMatch ? best : null,
    topCandidates,
    effectiveThreshold: threshold,
  };
}

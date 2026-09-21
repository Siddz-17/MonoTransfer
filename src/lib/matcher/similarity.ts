/**
 * Dice-coefficient string similarity and string normalization utilities
 * for the MonoTransfer matching engine.
 */

/**
 * Normalizes title string by stripping common noise:
 * - (feat. ...), [feat. ...], ft. ...
 * - (Official Video), (Official Audio), [MV], (Music Video), (Lyric Video)
 * - (Remastered...), (20xx Remaster), (Deluxe Edition)
 * - HD, 4K, brackets, punctuation
 */
export function normalizeTitle(rawTitle: string): string {
  if (!rawTitle) return "";
  let s = rawTitle.toLowerCase();

  // Remove featured artists markers in parens or brackets
  s = s.replace(/\((?:feat|ft|featuring)\.?[^)]*\)/gi, " ");
  s = s.replace(/\[(?:feat|ft|featuring)\.?[^\]]*\]/gi, " ");
  s = s.replace(/\b(?:feat|ft|featuring)\.?\s+[^&,-]+/gi, " ");

  // Remove video/audio indicators
  s = s.replace(/\((?:official\s+)?(?:video|music\s+video|audio|lyric\s+video|visualizer)\)/gi, " ");
  s = s.replace(/\[(?:official\s+)?(?:video|music\s+video|audio|lyric\s+video|visualizer)\]/gi, " ");
  s = s.replace(/\b(?:official\s+video|official\s+audio|lyric\s+video)\b/gi, " ");

  // Remove remastered / edition tags (e.g. (2021 Remaster), [2011 Remastered], etc.)
  s = s.replace(/\([^)]*(?:remaster|deluxe|anniversary|mono|stereo|expanded)[^)]*\)/gi, " ");
  s = s.replace(/\[[^\]]*(?:remaster|deluxe|anniversary|mono|stereo|expanded)[^\]]*\]/gi, " ");
  s = s.replace(/-\s*(?:remastered|\d{4}\s*remaster).*$/gi, " ");

  // Remove resolution / quality tags
  s = s.replace(/\b(?:4k|hd|hq|1080p|720p)\b/gi, " ");

  // Remove non-alphanumeric characters (keep basic spaces and letters/numbers)
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");

  // Collapse multiple spaces
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

/**
 * Normalizes artist name: lowercased, punctuation stripped, normalized whitespace.
 */
export function normalizeArtist(rawArtist: string): string {
  if (!rawArtist) return "";
  let s = rawArtist.toLowerCase();
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Calculates Sørensen-Dice coefficient between two strings using character bigrams.
 * Returns a score between 0.0 and 1.0.
 */
export function diceCoefficient(str1: string, str2: string): number {
  const s1 = str1.trim();
  const s2 = str2.trim();

  if (s1 === s2) return 1.0;
  if (s1.length < 2 || s2.length < 2) {
    return s1 === s2 ? 1.0 : 0.0;
  }

  // Generate bigrams for s1
  const bigrams1 = new Map<string, number>();
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.substring(i, i + 2);
    bigrams1.set(bg, (bigrams1.get(bg) || 0) + 1);
  }

  // Count intersections with bigrams in s2
  let intersection = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.substring(i, i + 2);
    const count = bigrams1.get(bg) || 0;
    if (count > 0) {
      bigrams1.set(bg, count - 1);
      intersection++;
    }
  }

  const totalBigrams = (s1.length - 1) + (s2.length - 1);
  return (2.0 * intersection) / totalBigrams;
}

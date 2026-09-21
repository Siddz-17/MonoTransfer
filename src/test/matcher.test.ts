import assert from "assert";
import { encryptToken, decryptToken } from "../lib/crypto";
import { normalizeTitle, normalizeArtist, diceCoefficient } from "../lib/matcher/similarity";
import { scoreCandidate, evaluateCandidates } from "../lib/matcher/scoring";

console.log("=================================================");
console.log("  MONOTRANSFER // VERIFICATION TEST SUITE");
console.log("=================================================\n");

// 1. Test AES-256-GCM Token Encryption & Decryption
console.log("[Test 1] Testing AES-256-GCM encryption & decryption...");
const sampleToken = "ya29.a0AfH6SMD_MockSpotifyAccessToken123456789";
const encrypted = encryptToken(sampleToken);
assert(encrypted.ciphertext && encrypted.ciphertext.length > 0, "Ciphertext should not be empty");
assert(encrypted.iv && encrypted.iv.length === 24, "IV should be 12 bytes hex (24 chars)");
assert(encrypted.authTag && encrypted.authTag.length === 32, "AuthTag should be 16 bytes hex (32 chars)");

const decrypted = decryptToken(encrypted.ciphertext, encrypted.iv, encrypted.authTag);
assert.strictEqual(decrypted, sampleToken, "Decrypted token must match original plaintext");
console.log("✓ AES-256-GCM Encryption/Decryption verified.\n");

// 2. Test Title Normalization
console.log("[Test 2] Testing Title Normalization...");
const rawTitle1 = "Around The World (feat. Pharrell Williams) [Official Music Video] (2021 Remaster) [HD]";
const normTitle1 = normalizeTitle(rawTitle1);
assert(!normTitle1.includes("feat"), "Should strip feat");
assert(!normTitle1.includes("official music video"), "Should strip official music video");
assert(!normTitle1.includes("remaster"), "Should strip remaster");
assert(!normTitle1.includes("hd"), "Should strip HD");
assert.strictEqual(normTitle1, "around the world");

const rawTitle2 = "Midnight City - 2011 Remastered Version";
const normTitle2 = normalizeTitle(rawTitle2);
assert(!normTitle2.includes("remastered"), "Should strip remastered suffix");
console.log(`✓ Title normalized: "${rawTitle1}" → "${normTitle1}"`);
console.log("✓ Title normalization verified.\n");

// 3. Test Dice-Coefficient String Similarity
console.log("[Test 3] Testing Dice-Coefficient similarity...");
const diceIdentical = diceCoefficient("around the world", "around the world");
assert.strictEqual(diceIdentical, 1.0, "Identical strings must equal 1.0");

const diceSimilar = diceCoefficient("windowlicker", "window licker");
assert(diceSimilar > 0.70, `Similar strings should score > 0.70 (got ${diceSimilar})`);

const diceDifferent = diceCoefficient("aphex twin", "daft punk");
assert(diceDifferent < 0.20, `Different strings should score < 0.20 (got ${diceDifferent})`);
console.log(`✓ Dice scores: identical=1.0, similar=${diceSimilar.toFixed(3)}, different=${diceDifferent.toFixed(3)}`);
console.log("✓ Dice-Coefficient similarity verified.\n");

// 4. Test Matching Engine Scoring & Penalty Multipliers
console.log("[Test 4] Testing Candidate Scoring & Penalty Multipliers...");
const sourceTrack = {
  title: "Windowlicker",
  artist: "Aphex Twin",
  album: "Windowlicker",
  durationMs: 367000,
  isExplicit: true,
};

// Exact candidate
const exactCand = {
  videoId: "7MBaEEODzU0",
  title: "Windowlicker",
  artists: ["Aphex Twin"],
  album: "Windowlicker",
  durationSeconds: 367,
  isExplicit: true,
};

const exactScore = scoreCandidate(sourceTrack, exactCand, {
  matchLiveVersions: false,
  matchExplicitVersions: true,
  minimumConfidenceThreshold: 0.72,
});
assert(exactScore.confidenceScore >= 0.95, `Exact match confidence should be >= 0.95 (got ${exactScore.confidenceScore})`);
console.log(`✓ Exact match confidence: ${exactScore.confidenceScore} (${exactScore.breakdown})`);

// Live version candidate when matchLiveVersions = false
const liveCand = {
  videoId: "live123",
  title: "Windowlicker (Live at Glastonbury)",
  artists: ["Aphex Twin"],
  durationSeconds: 367,
  isExplicit: true,
};
const liveScore = scoreCandidate(sourceTrack, liveCand, {
  matchLiveVersions: false,
  matchExplicitVersions: true,
  minimumConfidenceThreshold: 0.72,
});
assert(liveScore.penaltyMultiplier <= 0.20, "Live penalty multiplier should be <= 0.20 when matchLiveVersions is false");
assert(liveScore.confidenceScore < 0.30, "Live candidate confidence should be depressed by penalty multiplier");
console.log(`✓ Live penalty applied: confidence=${liveScore.confidenceScore} (multiplier=${liveScore.penaltyMultiplier})`);

// 5. Test Candidate Evaluation and Retry Pass
console.log("\n[Test 5] Testing Candidate Evaluation & Relaxed Retry Pass...");
const borderlineCand = {
  videoId: "borderline1",
  title: "Window Licker Official Audio",
  artists: ["Aphex Twin"],
  durationSeconds: 340, // 27s diff
  isExplicit: false, // explicit mismatch with matchExplicitVersions: true
};

// Pass 1 with strict threshold 0.72
const pass1 = evaluateCandidates(sourceTrack, [borderlineCand], {
  matchLiveVersions: false,
  matchExplicitVersions: true,
  minimumConfidenceThreshold: 0.72,
  isRetryPass: false,
});
console.log(`✓ Pass 1 evaluated: matched=${pass1.matched}, confidence=${pass1.topCandidates[0]?.confidenceScore}, threshold=${pass1.effectiveThreshold}`);

// Pass 2 with relaxed retry pass: threshold drops to max(0.5, 0.72 - 0.15) = 0.57
const pass2 = evaluateCandidates(sourceTrack, [borderlineCand], {
  matchLiveVersions: false,
  matchExplicitVersions: true,
  minimumConfidenceThreshold: 0.72,
  isRetryPass: true,
});
assert.strictEqual(pass2.effectiveThreshold, 0.57, "Retry pass effective threshold should be relaxed to 0.57");
console.log(`✓ Pass 2 (Retry Pass) relaxed threshold: ${pass2.effectiveThreshold}`);

console.log("\n=================================================");
console.log("  ALL TESTS PASSED SUCCESSFULLY! (5/5)");
console.log("=================================================");

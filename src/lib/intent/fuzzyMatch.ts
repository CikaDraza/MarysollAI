// src/lib/intent/fuzzyMatch.ts
//
// Phase 4 — Levenshtein-based fuzzy fallback.
//
// Used by service synonym lookup so that "šišanj" still matches "sisanje"
// after exact-key resolution misses. Kept dependency-free; the algorithm
// is small enough to inline (a leven/fuzzysort dependency would be ~3KB
// just for this single use site).
//
// Tolerance is scaled by input length to avoid false positives on short
// inputs where most words are within 1-2 edits of each other:
//   length 1-3  → no fuzzy match (would match too aggressively)
//   length 4-5  → tolerance 1
//   length 6-8  → tolerance 2
//   length 9+   → tolerance 3 (still capped — long words may have multiple typos)

/** Iterative two-row Levenshtein distance. O(a.length * b.length) time,
 * O(min(a, b)) space. Returns the minimum number of single-character
 * insertions, deletions, or substitutions to transform `a` into `b`. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  // Ensure b is the shorter string so the row buffer is the smaller one.
  if (a.length < b.length) {
    [a, b] = [b, a];
  }

  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** Returns the per-input-length tolerance for fuzzy matching. Words shorter
 * than 4 characters are not eligible for fuzzy fallback at all. */
export function fuzzyToleranceFor(length: number): number {
  if (length < 4) return 0;
  if (length <= 5) return 1;
  if (length <= 8) return 2;
  return 3;
}

/**
 * Find the closest key in `candidates` to `input` within the per-length
 * tolerance. Returns null if no candidate is close enough.
 *
 * `input` and every entry in `candidates` must already be normalized
 * (lowercase, diacritics stripped, trimmed) by the caller.
 */
export function findFuzzyMatch(
  input: string,
  candidates: Iterable<string>,
): string | null {
  const tolerance = fuzzyToleranceFor(input.length);
  if (tolerance === 0) return null;

  let best: { key: string; distance: number } | null = null;
  for (const key of candidates) {
    // Cheap pre-filter: if the length gap alone already exceeds tolerance,
    // skip the full DP table.
    if (Math.abs(key.length - input.length) > tolerance) continue;
    if (key.length < 4) continue; // too-short keys → ambiguous
    const d = levenshtein(input, key);
    if (d > tolerance) continue;
    if (!best || d < best.distance) {
      best = { key, distance: d };
      if (d === 0) break;
    }
  }
  return best?.key ?? null;
}

// src/lib/search/slotScore.ts
//
// Phase 2.5A — Centralized weighted slot scoring.
//
// findBestSlots#computeRelevance has the de-facto scoring logic with hardcoded
// weights. This module exposes a CONFIGURABLE, COMPOSABLE scoring helper that
// the unified ranking adapter (rankSearchResults) uses for strategy-specific
// adjustments WITHOUT touching findBestSlots.
//
// IMPORTANT — design decisions:
//   - All inputs are normalized to [0, 1] before weighting. This makes weights
//     intuitive (they sum to 1 conceptually) and prevents one signal from
//     dominating when its raw range is large (distance can be 0–200 km).
//   - Missing signals default to neutral (0.5) — they don't penalize.
//     This matches Task 14's "safe result recovery" rule.
//   - Distance scoring is capped at MAX_DISTANCE_KM = 200; further away
//     contributes 0 to the distance component. The fallback engine already
//     bounded results at 200 km, so this is consistent.
//   - Final score is bounded to integer for stable sort + log readability.
import { aiLog } from "@/lib/ai/debug-log";
import {
  getAvailabilityConfidenceScore,
  type AvailabilityConfidence,
} from "@/lib/availability/availabilityConfidence";

const log = aiLog("SLOT_SCORE");

// ── Weights ───────────────────────────────────────────────────────────────────

/**
 * Default weight set — used when caller doesn't override.
 * Sum should be ~1 for intuition; small deviations are fine.
 *
 * Tuning notes:
 *   - availabilityConfidence dominates by design. Booking UX must prefer
 *     trustworthy availability over convenience.
 *   - distance/rating/freshness still sort inside the same confidence tier.
 *   - testimonials separate from rating because they capture sentiment vs.
 *     numeric stars (some salons have one but not the other).
 */
export const SEARCH_WEIGHTS = {
  availabilityConfidence: 0.82,
  distance: 0.06,
  popularity: 0.04,
  rating: 0.03,
  freshness: 0.03,
  bookingFrequency: 0.01,
  testimonials: 0.01,
} as const;

export type SearchWeights = Record<keyof typeof SEARCH_WEIGHTS, number>;

/** Internal max distance for normalization. Beyond this, the distance signal
 * contributes 0 (treated as "off-grid"). */
const MAX_DISTANCE_KM = 200;
/** Beyond this many days out, freshness signal floors to 0. */
const MAX_DAYS_OUT = 14;

// ── Inputs ────────────────────────────────────────────────────────────────────

export interface SlotScoreInput {
  /** ISO 8601 start time. Used for freshness. */
  startTime: string;
  /** Haversine km from user to salon. Pass undefined when unknown. */
  distanceKm?: number;
  /** Precomputed geo proximity score, normalized 0-1. Preferred over distanceKm. */
  distanceScore?: number;
  /** Salon's average rating (0–5). */
  rating?: number;
  /** Popularity score 0–1 (caller normalizes from booking counts etc.). */
  popularity?: number;
  /** Recent booking-frequency score 0–1. */
  bookingFrequency?: number;
  /** Testimonial weighted average 0–1. */
  testimonials?: number;
  /** Optional fallback level — earlier levels score higher. */
  fallbackLevel?: number;
  /** Data quality behind the slot availability. Trust is the primary signal. */
  availabilityConfidence?: AvailabilityConfidence;
  availabilityConfidenceScore?: number;
}

export interface SlotScoreResult {
  score: number;
  /** Per-component normalized signals (0–1). Useful for debug + tuning. */
  components: Record<keyof SearchWeights, number>;
}

// ── Normalizers ───────────────────────────────────────────────────────────────

function normalizeDistance(distanceKm: number | undefined): number {
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm < 0) {
    return 0.5;
  }
  if (distanceKm >= MAX_DISTANCE_KM) return 0;
  return 1 - distanceKm / MAX_DISTANCE_KM;
}

function normalizeRating(rating: number | undefined): number {
  if (rating == null || !Number.isFinite(rating)) return 0.5;
  if (rating <= 0) return 0;
  if (rating >= 5) return 1;
  return rating / 5;
}

function normalizeFreshness(startTime: string): number {
  const t = new Date(startTime).getTime();
  if (!Number.isFinite(t)) return 0.5;
  const daysOut = (t - Date.now()) / 86_400_000;
  if (daysOut <= 0) return 1; // happening now / today
  if (daysOut >= MAX_DAYS_OUT) return 0;
  return 1 - daysOut / MAX_DAYS_OUT;
}

function normalizeUnit(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0.5;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function normalizeAvailabilityConfidence(
  confidence: SlotScoreInput["availabilityConfidence"],
  confidenceScore?: number,
): number {
  if (typeof confidenceScore === "number" && Number.isFinite(confidenceScore)) {
    if (confidenceScore <= 0) return 0;
    if (confidenceScore >= 1) return 1;
    return confidenceScore;
  }
  const score = getAvailabilityConfidenceScore(confidence);
  if (score > 0) return score;
  return 0.5;
}

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Compute a weighted score in the range [0, 1000].
 *
 * Why integer-bounded: stable sort, easy log readability, comparable across
 * strategies. The internal float math is preserved in `components` for
 * debugging and tuning.
 */
export function calculateSlotScore(
  input: SlotScoreInput,
  weights: Partial<SearchWeights> = {},
): SlotScoreResult {
  const w: SearchWeights = { ...SEARCH_WEIGHTS, ...weights };

  const components: Record<keyof SearchWeights, number> = {
    availabilityConfidence: normalizeAvailabilityConfidence(
      input.availabilityConfidence,
      input.availabilityConfidenceScore,
    ),
    distance: normalizeUnit(input.distanceScore ?? normalizeDistance(input.distanceKm)),
    popularity: normalizeUnit(input.popularity),
    rating: normalizeRating(input.rating),
    freshness: normalizeFreshness(input.startTime),
    bookingFrequency: normalizeUnit(input.bookingFrequency),
    testimonials: normalizeUnit(input.testimonials),
  };

  let score = 0;
  for (const k of Object.keys(components) as Array<keyof SearchWeights>) {
    score += components[k] * w[k];
  }

  // Fallback level penalty applied AFTER weighted sum so it doesn't get
  // swallowed by per-component normalization. -10 per level keeps it subtle.
  const fallbackPenalty = (input.fallbackLevel ?? 0) * 0.01;
  const adjusted = Math.max(0, score - fallbackPenalty);

  // Project to integer 0–1000 for stable sort.
  const finalScore = Math.round(adjusted * 1000);
  return { score: finalScore, components };
}

/**
 * Comparator for sorting SearchResult-shaped items by computed score.
 * Caller passes a function to extract scoring inputs from the item.
 */
export function compareBySlotScore<T>(
  extract: (item: T) => SlotScoreInput,
  weights?: Partial<SearchWeights>,
): (a: T, b: T) => number {
  return (a, b) => {
    const sa = calculateSlotScore(extract(a), weights).score;
    const sb = calculateSlotScore(extract(b), weights).score;
    return sb - sa;
  };
}

/** Dev-only: log a representative top-N sample with component breakdowns. */
export function debugLogTopScored<T>(
  items: T[],
  extract: (item: T) => SlotScoreInput,
  topN = 3,
  label = "topN",
): void {
  log(label, {
    items: items.slice(0, topN).map((it) => calculateSlotScore(extract(it))),
  });
}

// src/lib/search/rankSearchResults.ts
//
// Phase 2.5A — Unified search-ranking adapter.
//
// PUBLIC ENTRY POINT for QuickAccess, BookingWidget, AI search, recovery flow.
// All four surfaces should call this — same ranking logic, only strategy
// differs (limit, grouping, presentation).
//
// Architecture:
//   1. Caller passes pre-fetched SearchResult[] (already returned by
//      findBestSlots or the search API). This module DOES NOT fetch — it
//      ranks + shapes what the caller has.
//   2. Slots are scored using calculateSlotScore (Phase 2.5A scoring engine).
//   3. Strategy decides limit, grouping, diversity rules.
//   4. Output shape is deterministic regardless of strategy.
//
// We deliberately don't replace findBestSlots — its 6-level fallback runs
// upstream. Once we want to migrate scoring fully, the caller can use
// findBestSlots only for fallback selection and pipe results here for
// scoring/grouping.
import type { SearchResult } from "@/types/slots";
import {
  calculateSlotScore,
  SEARCH_WEIGHTS,
  type SearchWeights,
  type SlotScoreInput,
} from "./slotScore";
import {
  resolveSearchFallback,
  type FallbackInfo,
} from "./searchFallback";
import { diversifySorted, type DiversityRules } from "./diversity";
import { filterByRadius } from "./filterByRadius";
import { aiLog } from "@/lib/ai/debug-log";

const log = aiLog("RANKING");

// ── Public types ──────────────────────────────────────────────────────────────

export type SearchStrategy =
  | "quickaccess"
  | "bookingwidget"
  | "searchpage"
  | "ai_recovery";

export interface RankSearchInput {
  /** Pre-fetched candidate slots. Caller is responsible for fetching. */
  slots: SearchResult[];
  /** Caller's geo for distance scoring (optional — falls back to neutral). */
  userLocation?: { lat: number; lng: number };
  /** Original query terms (only used for debug; ranking is on slots already). */
  city?: string;
  service?: string;
  category?: string;
  /** Strategy controls limit + grouping ONLY. Never ranking logic. */
  strategy: SearchStrategy;
  /** Override default limit. Defaults are strategy-specific. */
  limit?: number;
  /** Override default scoring weights. Most callers shouldn't need this. */
  weights?: Partial<SearchWeights>;
  /** Optional radius gate. Unknown-distance slots are preserved as last resort. */
  maxDistanceKm?: number;
  /** Fallback level returned by findBestSlots (0–6). Optional. */
  fallbackLevel?: number;
  fallbackLabel?: string;
  /** Geo source label (gps / explicit / saved / ip / trending). Forwarded
   * into rankingMeta on each slot for analytics + debug. */
  geoSource?: string;
}

/**
 * Phase 2.5D Tasks 4 + 8 — Ranking metadata attached to each returned slot.
 *
 * Lightweight wrapper over SearchResult so consumers can read score / strategy
 * / geo source / fallback indicators without duplicating logic. The wrapper
 * is transparent for existing render code thanks to spreading; new code can
 * read `slot.rankingMeta` and `slot.fromFallback` directly.
 *
 * Why intersect instead of a side-table: avoids identity-key gymnastics for
 * downstream code (analytics, debug panel, AI explainability). One slot
 * carries everything it needs to be explained.
 */
export interface SlotRankingMeta {
  /** Final 0–1000 weighted score after scoring + tiebreakers. */
  score: number;
  /** Fallback level the search came from (0–6). */
  fallbackLevel: number;
  /** Strategy that produced this ordering. */
  strategy: SearchStrategy;
  /** Geo source used for distance scoring (if any). */
  geoSource?: string;
  /** True when diversity rules pushed this slot DOWN in the order. */
  diversityApplied: boolean;
}

export type RankedSlot = SearchResult & {
  /** Phase 2.5D — set when fallbackLevel > 1. Lets UI/analytics flag
   * results that come from a relaxed query. */
  fromFallback?: boolean;
  /** Per-slot ranking explainability bundle. Always present on slots
   * returned by `rankSearchResults`. */
  rankingMeta: SlotRankingMeta;
};

export interface RankedSearchResult {
  slots: RankedSlot[];
  /** When strategy === "bookingwidget", slots are also grouped by city for
   * the "3 rows × 5 slots" layout. Empty array for other strategies. */
  groupedByCity: Array<{ city: string; slots: RankedSlot[] }>;
  fallback: FallbackInfo;
  usedStrategy: SearchStrategy;
  debug: {
    inputCount: number;
    outputCount: number;
    appliedWeights: SearchWeights;
    /** Score range across the returned slots. */
    scoreRange?: { min: number; max: number };
  };
}

// ── Strategy presets ──────────────────────────────────────────────────────────

interface StrategyConfig {
  defaultLimit: number;
  /** Per-dimension diversity caps applied AFTER scoring (Task 17). */
  diversity: DiversityRules;
  /** Group output by city (used by BookingWidget). */
  groupByCity: boolean;
  /** When grouping, cap rows. */
  maxCityGroups: number;
  /** When grouping, slots per city group. */
  slotsPerCity: number;
}

const STRATEGY: Record<SearchStrategy, StrategyConfig> = {
  // Top quick picks — variety dominates over depth. Keep the visible set to
  // one salon/service/start-time each whenever enough candidates exist.
  quickaccess: {
    defaultLimit: 3,
    diversity: { maxPerSalon: 1, maxPerService: 1, maxPerCategory: 3, maxPerStartTime: 1 },
    groupByCity: false,
    maxCityGroups: 0,
    slotsPerCity: 0,
  },
  // 3 rows × 5 slots, each row = a city. Within a city, allow 2 slots/salon
  // so a strong salon can show "earlier + later" pair.
  bookingwidget: {
    defaultLimit: 15,
    diversity: { maxPerSalon: 2 },
    groupByCity: true,
    maxCityGroups: 3,
    slotsPerCity: 5,
  },
  // Full result list, paginated upstream — let users see everything.
  searchpage: {
    defaultLimit: 50,
    diversity: {},
    groupByCity: false,
    maxCityGroups: 0,
    slotsPerCity: 0,
  },
  // AI recovery — wider net, but still avoid 5 identical results.
  ai_recovery: {
    defaultLimit: 8,
    diversity: { maxPerSalon: 2, maxPerService: 3 },
    groupByCity: false,
    maxCityGroups: 0,
    slotsPerCity: 0,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map a SearchResult into the SlotScoreInput shape. Missing signals stay
 * undefined so calculateSlotScore can apply neutral defaults. */
function toScoreInput(
  s: SearchResult,
  fallbackLevel: number | undefined,
): SlotScoreInput {
  return {
    startTime: s.startTime,
    distanceKm: s.distanceKm ?? undefined,
    distanceScore: s.distanceScore ?? undefined,
    rating: s.rating ?? undefined,
    fallbackLevel,
    availabilityConfidence: s.availabilityConfidence,
    availabilityConfidenceScore: s.availabilityConfidenceScore,
    // popularity / bookingFrequency / testimonials are not yet in SearchResult.
    // calculateSlotScore treats undefined as neutral (0.5) so today's behavior
    // is unchanged — this becomes a real signal once the platform exposes it.
  };
}

function exactSlotKey(s: SearchResult): string {
  return `${s.salonId}|${s.startTime}|${s.serviceId ?? ""}`;
}

function dedupeExactSlots(slots: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const out: SearchResult[] = [];

  for (const slot of slots) {
    const key = exactSlotKey(slot);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(slot);
  }

  return out;
}

function groupByCity<T extends { city: string }>(
  slots: T[],
  maxGroups: number,
  perGroup: number,
): Array<{ city: string; slots: T[] }> {
  const buckets = new Map<string, T[]>();
  for (const s of slots) {
    const key = s.city || "—";
    if (!buckets.has(key)) buckets.set(key, []);
    const arr = buckets.get(key)!;
    if (arr.length < perGroup) arr.push(s);
  }
  return Array.from(buckets.entries())
    .slice(0, maxGroups)
    .map(([city, slots]) => ({ city, slots }));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Rank + shape pre-fetched search results for a specific UI surface.
 *
 * USAGE:
 *   const ranked = rankSearchResults({
 *     slots: searchApiResponse.results,
 *     userLocation: { lat, lng },
 *     strategy: "quickaccess",
 *     fallbackLevel: searchApiResponse.fallbackLevel,
 *   });
 *
 * Output is deterministic across strategies — the only differences are
 * `limit`, `groupedByCity`, and per-salon diversity caps.
 */
export function rankSearchResults(input: RankSearchInput): RankedSearchResult {
  const cfg = STRATEGY[input.strategy];
  const weights: SearchWeights = { ...SEARCH_WEIGHTS, ...(input.weights ?? {}) };
  const limit = input.limit ?? cfg.defaultLimit;

  // Defensive: filter out malformed inputs (Task 14 — safe recovery).
  const sanitized = dedupeExactSlots((input.slots ?? []).filter(
    (s) => s && typeof s.startTime === "string" && typeof s.salonId === "string",
  ));
  const safeSlots =
    input.maxDistanceKm != null
      ? filterByRadius({ slots: sanitized, maxDistanceKm: input.maxDistanceKm })
      : sanitized;

  if (safeSlots.length === 0) {
    return {
      slots: [],
      groupedByCity: [],
      fallback: resolveSearchFallback(input.fallbackLevel ?? 0, input.fallbackLabel),
      usedStrategy: input.strategy,
      debug: {
        inputCount: input.slots?.length ?? 0,
        outputCount: 0,
        appliedWeights: weights,
      },
    };
  }

  // Score every slot. We keep the score in a side-table keyed by slot identity
  // (salonId + startTime + serviceId) instead of mutating the slot — caller
  // shouldn't care that scoring happened.
  //
  // Task 19 — stable, deterministic ordering. When scores tie we cascade
  // through rating → distance → startTime → salonId. Same input → same output,
  // every render. No flicker between TanStack Query refetches that return
  // the same logical data in different order.
  const scored = safeSlots
    .map((s) => ({
      slot: s,
      score: calculateSlotScore(toScoreInput(s, input.fallbackLevel), weights).score,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ra = a.slot.rating ?? 0;
      const rb = b.slot.rating ?? 0;
      if (rb !== ra) return rb - ra;
      const da = a.slot.distanceKm ?? Number.POSITIVE_INFINITY;
      const db = b.slot.distanceKm ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      // Earlier slot wins on freshness tie.
      const ta = a.slot.startTime ?? "";
      const tb = b.slot.startTime ?? "";
      if (ta !== tb) return ta < tb ? -1 : 1;
      // Final deterministic tiebreaker so the result is reproducible.
      const sa = a.slot.salonId ?? "";
      const sb = b.slot.salonId ?? "";
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    });

  // Diversify by salon/service/category/city per strategy rules, then trim
  // to limit. Diversity is post-scoring re-ordering — never erases a slot.
  const preDiv = scored.map((x) => x.slot);
  const diversified = diversifySorted(preDiv, cfg.diversity).slice(0, limit);

  // Phase 2.5D Tasks 4 + 8 — attach rankingMeta + fromFallback to each
  // surviving slot. Score is read from the side-table built above; diversity
  // application is detected by checking whether the slot's pre-diversity
  // index differs from its post-diversity index.
  const fallbackLevel = input.fallbackLevel ?? 0;
  const isFromFallback = fallbackLevel > 1;
  const scoreByKey = new Map<string, number>();
  for (const x of scored) {
    const key = exactSlotKey(x.slot);
    scoreByKey.set(key, x.score);
  }
  const preDivIndex = new Map<string, number>();
  preDiv.forEach((s, i) => {
    const key = exactSlotKey(s);
    preDivIndex.set(key, i);
  });

  function attachMeta(s: SearchResult, postIdx: number): RankedSlot {
    const key = exactSlotKey(s);
    const score = scoreByKey.get(key) ?? 0;
    const preIdx = preDivIndex.get(key) ?? postIdx;
    return Object.assign({}, s, {
      fromFallback: isFromFallback,
      rankingMeta: {
        score,
        fallbackLevel,
        strategy: input.strategy,
        geoSource: input.geoSource,
        diversityApplied: postIdx !== preIdx,
      },
    });
  }

  const diversifiedRanked: RankedSlot[] = diversified.map((s, i) =>
    attachMeta(s, i),
  );

  const groupedByCity = cfg.groupByCity
    ? groupByCity(diversifiedRanked, cfg.maxCityGroups, cfg.slotsPerCity)
    : [];

  const minScore = scored.length > 0 ? scored[scored.length - 1].score : 0;
  const maxScore = scored.length > 0 ? scored[0].score : 0;

  log("ranked", {
    strategy: input.strategy,
    inputCount: safeSlots.length,
    outputCount: diversified.length,
    fallbackLevel: input.fallbackLevel ?? 0,
    minScore,
    maxScore,
  });

  return {
    slots: diversifiedRanked,
    groupedByCity,
    fallback: resolveSearchFallback(input.fallbackLevel ?? 0, input.fallbackLabel),
    usedStrategy: input.strategy,
    debug: {
      inputCount: safeSlots.length,
      outputCount: diversifiedRanked.length,
      appliedWeights: weights,
      scoreRange: { min: minScore, max: maxScore },
    },
  };
}

/**
 * Phase 2.5D Task 6 — AI search ranking entry point.
 *
 * The platform's AI agents (Maria, Claudia) DO NOT produce their own slot
 * ordering — they emit BLOCK payloads (LandingSearchBlock, AppointmentCalendar-
 * Block, etc.) which then consume `/api/search` via `useSearchContext` and
 * route through `rankSearchResults` like every other surface. The data path is
 * structurally unified.
 *
 * This helper exists for any future AI-side code path that receives a raw
 * slot list (e.g. an LLM-generated recommendation set) and wants to rank it
 * using the SAME engine as every other consumer. Calling this is preferable
 * to inventing per-AI ranking heuristics.
 *
 * Strategy is `ai_recovery` — a wider net than `quickaccess`: 8 slots,
 * max 2 per salon, max 3 per service. Lets the AI surface alternatives a
 * user wouldn't have manually filtered for.
 */
export function rankAIRecommendations(
  input: Omit<RankSearchInput, "strategy">,
): RankedSearchResult {
  return rankSearchResults({ ...input, strategy: "ai_recovery" });
}

// src/lib/availability/fallbackPolicy.ts
//
// Pure fallback consumer policy helper.
//
// Separates "what fallback level is this slot from?" from "is that level
// acceptable for this consumer surface and intent?"
//
// INVARIANTS:
//   - Pure function — no I/O, no context reads.
//   - Applied BEFORE rankSearchResults. Ranking never decides consumer policy.
//   - QuickAccess is a TRUST surface. BookingWidget is a DISCOVERY surface.
//   - `maxFallbackLevel` is a strategy+intent constant, not a runtime value.
//
// INTEGRATION POINTS (Phase 3):
//   - applyFallbackPolicy enforces fallbackLevel + isSynthetic + slotOrigins.
//   - allowNearbyCities gates slotOrigins including "nearby_city".
//   - allowCategoryDrift gates slotOrigins including "related_service".

import type { SearchStrategy } from "@/lib/search/rankSearchResults";

// ── Public types ──────────────────────────────────────────────────────────────

export type SearchIntent =
  | { kind: "implicit_geo" }        // ambient — user hasn't typed anything
  | { kind: "explicit_service" }    // user typed a service name
  | { kind: "explicit_city_service" } // user typed city + service
  | { kind: "explicit_full" }       // city + service + datetime
  | { kind: "ai_recovery" }         // AI-initiated recovery search
  | { kind: "discovery" };          // browse / no specific intent

export interface FallbackPolicy {
  /** Slots with fallbackLevel > this value are removed before ranking. */
  maxFallbackLevel: number;
  /** Whether synthetic (workingHours-generated) slots are allowed. */
  allowSynthetic: boolean;
  /** Whether slots from cities other than the user's city are allowed. */
  allowNearbyCities: boolean;
  /** Whether slots from related but different categories are allowed (L3). */
  allowCategoryDrift: boolean;
  /** Whether service synonym / variant matches are allowed. */
  allowServiceVariants: boolean;
  /** Whether slots outside the requested time window are allowed (L2). */
  allowRelaxedTime: boolean;
}

/** Minimum slot interface required by applyFallbackPolicy. */
export interface PolicyFilterableSlot {
  fallbackLevel: number;
  isSynthetic?: boolean;
  /** Semantic origins — used to enforce allowNearbyCities + allowCategoryDrift. */
  slotOrigins?: SlotOrigin[];
  /**
   * Availability confidence of the underlying data source.
   * Primary gate for the synthetic guard:
   *   "synthetic_projection" → always blocked when allowSynthetic=false.
   *   "working_hours_only"   → allowed (real salon + real hours, no calendar data).
   *   "calendar_verified"    → always allowed.
   * When absent, isSynthetic===true is treated as "synthetic_projection" for backward compat.
   */
  availabilityConfidence?: "calendar_verified" | "working_hours_only" | "synthetic_projection";
}

/** Semantic origin of a slot — richer than bare fallbackLevel.
 * Populated in Phase 3 when origin tagging is wired into findBestSlots. */
export type SlotOrigin =
  | "real"             // calendar-verified available slot
  | "synthetic"        // generated from workingHours — no calendar verification
  | "nearby_city"      // real slot from a city the user did not request
  | "relaxed_time"     // real slot outside the requested time window
  | "related_service"; // real slot with a synonym / variant service match

/** Availability confidence level of the underlying data source.
 * Populated in Phase 3 alongside SlotOrigin. */
export type AvailabilityConfidence =
  | "calendar_verified"    // real appointments + blocks resolved
  | "working_hours_only"   // hours known, actual bookings unknown
  | "synthetic_projection"; // fully generated, no real-world basis

// ── Strategy defaults ─────────────────────────────────────────────────────────
//
// QuickAccess: trust surface. Small, high-confidence results only.
//   - Never synthetic, never cross-city, never category drift.
//   - maxFallbackLevel varies by intent (see QUICKACCESS_INTENT_OVERRIDES).
//
// BookingWidget: discovery surface. Wider net, cross-city ok.
//   - Synthetic still forbidden — showing "projected" slots as if confirmed
//     undermines trust in a primary booking surface.
//
// ai_recovery: widest net. AI context signals recovery intent.
//
// searchpage: full results. User is explicitly browsing.

const STRATEGY_DEFAULTS: Record<SearchStrategy, FallbackPolicy> = {
  quickaccess: {
    maxFallbackLevel: 2,
    allowSynthetic: false,
    allowNearbyCities: false,
    allowCategoryDrift: false,
    allowServiceVariants: true,
    allowRelaxedTime: true,
  },
  bookingwidget: {
    maxFallbackLevel: 5,
    allowSynthetic: false,
    allowNearbyCities: true,
    allowCategoryDrift: false,
    allowServiceVariants: true,
    allowRelaxedTime: true,
  },
  ai_recovery: {
    maxFallbackLevel: 6,
    allowSynthetic: true,
    allowNearbyCities: true,
    allowCategoryDrift: true,
    allowServiceVariants: true,
    allowRelaxedTime: true,
  },
  searchpage: {
    maxFallbackLevel: 6,
    allowSynthetic: true,
    allowNearbyCities: true,
    allowCategoryDrift: true,
    allowServiceVariants: true,
    allowRelaxedTime: true,
  },
};

// QuickAccess intent overrides — only quickaccess varies meaningfully by intent.
//
// implicit_geo / discovery / ai_recovery: ambient or exploratory display.
//   No specific city or service was requested, so showing nearby-city results
//   (L5) is appropriate — better to show something useful than an empty panel.
//   L6 (synthetic) is still blocked by allowSynthetic=false.
//
// explicit_*: user named a specific service (or city + service).
//   Trust surface rules apply strictly — same city only, exact service match.
//   explicit_service → L1 max. explicit_city_service / explicit_full → L2 max.
const QUICKACCESS_INTENT_MAX_LEVEL: Record<SearchIntent["kind"], number> = {
  implicit_geo: 5,
  explicit_service: 1,
  explicit_city_service: 2,
  explicit_full: 2,
  ai_recovery: 5,
  discovery: 5,
};

// Additional per-intent policy overrides beyond maxFallbackLevel.
// Only the fields that differ from STRATEGY_DEFAULTS["quickaccess"] are listed.
const QUICKACCESS_INTENT_OVERRIDES: Partial<
  Record<SearchIntent["kind"], Partial<FallbackPolicy>>
> = {
  // Ambient / exploratory — nearby cities ok (no specific city was requested).
  implicit_geo: { allowNearbyCities: true },
  discovery:    { allowNearbyCities: true },
  ai_recovery:  { allowNearbyCities: true },
  // explicit_* intents: no override — base quickaccess defaults apply
  // (allowNearbyCities=false, allowCategoryDrift=false).
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve the fallback policy for a given consumer surface and search intent.
 *
 * Returns a plain object — deterministic for the same (strategy, intent) pair.
 * Apply the result via `applyFallbackPolicy` BEFORE calling `rankSearchResults`.
 */
export function resolveFallbackPolicy(
  strategy: SearchStrategy,
  intent: SearchIntent,
): FallbackPolicy {
  const base = STRATEGY_DEFAULTS[strategy];

  if (strategy === "quickaccess") {
    const maxLevel = QUICKACCESS_INTENT_MAX_LEVEL[intent.kind];
    const overrides = QUICKACCESS_INTENT_OVERRIDES[intent.kind] ?? {};
    return { ...base, maxFallbackLevel: maxLevel, ...overrides };
  }

  return base;
}

/**
 * Filter a slot array by a resolved FallbackPolicy.
 *
 * Enforces (in order):
 *   1. fallbackLevel cap
 *   2. synthetic guard (isSynthetic + allowSynthetic)
 *   3. allowNearbyCities — rejects slots with "nearby_city" in origins
 *   4. allowCategoryDrift — rejects slots with "related_service" in origins
 *
 * Generic over T so callers retain their concrete slot type.
 */
export function applyFallbackPolicy<T extends PolicyFilterableSlot>(
  slots: T[],
  policy: FallbackPolicy,
): T[] {
  return slots.filter((slot) => {
    if (slot.fallbackLevel > policy.maxFallbackLevel) return false;

    if (!policy.allowSynthetic) {
      const conf = slot.availabilityConfidence;
      // Primary gate: explicit confidence field.
      if (conf === "synthetic_projection") return false;
      // Backward compat: no confidence field but isSynthetic=true → treat as synthetic_projection.
      if (!conf && slot.isSynthetic === true) return false;
      // "working_hours_only" and "calendar_verified" pass through.
    }

    const origins = slot.slotOrigins ?? [];
    if (!policy.allowNearbyCities && origins.includes("nearby_city")) return false;
    if (!policy.allowCategoryDrift && origins.includes("related_service")) return false;

    return true;
  });
}

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
import type { AvailabilityConfidence } from "./availabilityConfidence";
import {
  canUseAsSyntheticFallback,
  explainBookingWidgetPolicy,
  explainQuickAccessPolicy,
  hasTrustworthyAvailability,
} from "./policies";

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
  availabilityConfidence?: AvailabilityConfidence;
}

export interface PolicyDecision {
  accepted: boolean;
  reason:
    | "none"
    | "invalid_confidence"
    | "synthetic_primary_surface"
    | "fallback_level"
    | "nearby_city"
    | "category_drift";
}

/** Semantic origin of a slot — richer than bare fallbackLevel.
 * Populated in Phase 3 when origin tagging is wired into findBestSlots. */
export type SlotOrigin =
  | "real"             // calendar-verified available slot
  | "synthetic"        // generated from workingHours — no calendar verification
  | "nearby_city"      // real slot from a city the user did not request
  | "relaxed_time"     // real slot outside the requested time window
  | "related_service"; // real slot with a synonym / variant service match

export type { AvailabilityConfidence } from "./availabilityConfidence";

// ── Strategy defaults ─────────────────────────────────────────────────────────
//
// QuickAccess: trust surface. Small, high-confidence results only.
//   - Never synthetic, never cross-city, never category drift.
//   - Capped at L2 for every intent. Empty is better than misleading.
//
// BookingWidget: discovery surface. Wider net, cross-city and synthetic ok,
// but synthetic must be visibly marked by the consumer UI.
//
// ai_recovery: wider net. AI context signals recovery intent, but still capped
// at L5 so fully synthetic L6 projections stay out of search results.
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
    maxFallbackLevel: 6,
    allowSynthetic: true,
    allowNearbyCities: true,
    allowCategoryDrift: true,
    allowServiceVariants: true,
    allowRelaxedTime: true,
  },
  ai_recovery: {
    maxFallbackLevel: 5,
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

// QuickAccess intent overrides — all intents are capped at L2 because this is a
// trust surface. AI recovery can be aggressive; QuickAccess cannot.
const QUICKACCESS_INTENT_MAX_LEVEL: Record<SearchIntent["kind"], number> = {
  implicit_geo: 2,
  explicit_service: 1,
  explicit_city_service: 2,
  explicit_full: 2,
  ai_recovery: 2,
  discovery: 2,
};

// Additional per-intent policy overrides beyond maxFallbackLevel.
// Only the fields that differ from STRATEGY_DEFAULTS["quickaccess"] are listed.
const QUICKACCESS_INTENT_OVERRIDES: Partial<
  Record<SearchIntent["kind"], Partial<FallbackPolicy>>
> = {
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
  const primary = slots.filter((slot) => evaluateFallbackPolicy(slot, policy).accepted);
  if (primary.length > 0) return primary;

  return [];
}

export function evaluateFallbackPolicy(
  slot: PolicyFilterableSlot,
  policy: FallbackPolicy,
): PolicyDecision {
  if (policy.allowSynthetic && canUseAsSyntheticFallback(slot)) {
    if (slot.fallbackLevel > policy.maxFallbackLevel) {
      return { accepted: false, reason: "fallback_level" };
    }
    return { accepted: true, reason: "none" };
  }

  const surfaceDecision =
    policy.allowNearbyCities || policy.maxFallbackLevel === 3
      ? explainBookingWidgetPolicy(slot)
      : explainQuickAccessPolicy(slot);

  if (!surfaceDecision.accepted) return surfaceDecision;

  // Confidence is the primary MVP trust gate. Trusted availability stays
  // displayable even when it came from a relaxed fallback level such as L4.
  if (hasTrustworthyAvailability(slot)) return { accepted: true, reason: "none" };

  const origins = slot.slotOrigins ?? [];
  if (!policy.allowNearbyCities && origins.includes("nearby_city")) {
    return { accepted: false, reason: "nearby_city" };
  }
  if (!policy.allowCategoryDrift && origins.includes("related_service")) {
    return { accepted: false, reason: "category_drift" };
  }

  if (slot.fallbackLevel > policy.maxFallbackLevel) {
    return { accepted: false, reason: "fallback_level" };
  }

  return { accepted: true, reason: "none" };
}

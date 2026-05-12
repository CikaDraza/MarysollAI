// src/lib/availability/arrivalFeasibility.ts
//
// Pure domain model for arrival feasibility evaluation.
// Answers: "Can the user realistically get to this salon in time for this slot?"
//
// INVARIANTS:
//   - Pure function — no I/O, no Date.now(), no context reads.
//   - `now` is always injected by the caller (deterministic, testable).
//   - Feasibility GATES candidates. It does not rank.
//   - Geo confidence expands buffers, never contracts them.
//   - Every result carries a `reason` — no silent rejections.
//   - Synthetic slots obey the same rules as real slots.

export type GeoConfidence =
  | "gps"       // device GPS — high accuracy
  | "explicit"  // user typed the city — high confidence
  | "saved"     // previously saved location — medium confidence
  | "ip"        // IP geolocation — city-level only, low confidence
  | "trending"  // platform trending city — no user signal
  | "none";     // no geo signal at all

export type FeasibilityReason =
  | "ok"
  | "past"
  | "minimum_operational_buffer"       // slot fails MOB but not travel
  | "too_soon_travel_estimated"         // distance known, not enough time
  | "too_soon_no_distance_city_match"   // no distance, same city — conservative
  | "too_soon_no_distance_city_mismatch" // no distance, different city
  | "too_soon_no_distance_city_unknown"; // no distance, city unknown

export interface ArrivalFeasibilityInput {
  /** Wall clock — always injected, never called internally. */
  now: Date;
  slotStartTime: Date;

  distanceKm?: number;
  geoConfidence?: GeoConfidence;
  /** True when user's resolved city matches the salon's city. */
  cityMatch?: boolean;

  /** Carried through to output but does not affect buffer logic.
   * Intent affects consumer policy (fallbackPolicy), not feasibility. */
  isSynthetic?: boolean;
  isExplicitIntent?: boolean;
}

export interface ArrivalFeasibilityResult {
  feasible: boolean;
  /** Exact cutoff — `slot.startTime >= earliestAllowedAt` is the feasibility gate. */
  earliestAllowedAt: Date;
  appliedBufferMinutes: number;
  reason: FeasibilityReason;
  confidence: "high" | "medium" | "low";
}

// ── Platform constants ────────────────────────────────────────────────────────
//
// MINIMUM_OPERATIONAL_BUFFER covers: salon notification, calendar sync,
// staff confirmation, anti-double-booking debounce, transaction latency.
// It is NOT travel time — it applies at distanceKm = 0.
// Changing this is a platform decision, not a per-call parameter.
const MINIMUM_OPERATIONAL_BUFFER_MIN = 15;

// Distance tier boundaries (km)
const WALKABLE_KM = 1.5;
const MEDIUM_KM = 8.0;

// Travel buffers by distance tier (minutes, before geo expansion)
const TRAVEL_WALKABLE_MIN = 10;
const TRAVEL_MEDIUM_MIN = 25;
const TRAVEL_FAR_MIN = 40;

// Geo confidence expansion — added on top of travel buffer.
// Low confidence → larger buffer. Never the reverse.
const GEO_EXPANSION_MIN: Record<GeoConfidence, number> = {
  gps: 0,
  explicit: 0,
  saved: 5,
  ip: 15,
  trending: 15,
  none: 20,
};

// Conservative travel buffers when distanceKm is unavailable
const TRAVEL_NO_DISTANCE_CITY_MATCH_MIN = 30;   // same city, no coordinates
const TRAVEL_NO_DISTANCE_CROSS_CITY_MIN = 60;   // different or unknown city

// ── Internal helpers ──────────────────────────────────────────────────────────

function baseTravelBuffer(distanceKm: number): number {
  if (distanceKm < WALKABLE_KM) return TRAVEL_WALKABLE_MIN;
  if (distanceKm <= MEDIUM_KM) return TRAVEL_MEDIUM_MIN;
  return TRAVEL_FAR_MIN;
}

function geoExpansion(geoConfidence: GeoConfidence | undefined): number {
  return GEO_EXPANSION_MIN[geoConfidence ?? "none"];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluate whether a slot is arrival-feasible given the user's current context.
 *
 * Returns a deterministic eligibility verdict with a full explanation.
 * Callers should apply this BEFORE ranking, not after.
 *
 * Feasibility gates. Ranking ranks. They must not cross.
 */
export function resolveArrivalFeasibility(
  input: ArrivalFeasibilityInput,
): ArrivalFeasibilityResult {
  const { now, slotStartTime, distanceKm, geoConfidence, cityMatch } = input;

  const nowMs = now.getTime();
  const slotMs = slotStartTime.getTime();

  // Hard rejection: slot is in the past (inclusive of exact-now)
  if (slotMs <= nowMs) {
    return {
      feasible: false,
      earliestAllowedAt: new Date(nowMs + MINIMUM_OPERATIONAL_BUFFER_MIN * 60_000),
      appliedBufferMinutes: MINIMUM_OPERATIONAL_BUFFER_MIN,
      reason: "past",
      confidence: "high",
    };
  }

  // Compute travel buffer and confidence from available signals
  const expansion = geoExpansion(geoConfidence);
  let travelBuffer: number;
  let resolvedConfidence: "high" | "medium" | "low";
  let distanceReason: FeasibilityReason;

  if (distanceKm !== undefined) {
    travelBuffer = baseTravelBuffer(distanceKm) + expansion;
    distanceReason = "too_soon_travel_estimated";
    if (expansion === 0) resolvedConfidence = "high";
    else if (expansion <= 5) resolvedConfidence = "medium";
    else resolvedConfidence = "low";
  } else if (cityMatch === true) {
    travelBuffer = TRAVEL_NO_DISTANCE_CITY_MATCH_MIN + expansion;
    distanceReason = "too_soon_no_distance_city_match";
    resolvedConfidence = "low";
  } else if (cityMatch === false) {
    travelBuffer = TRAVEL_NO_DISTANCE_CROSS_CITY_MIN + expansion;
    distanceReason = "too_soon_no_distance_city_mismatch";
    resolvedConfidence = "low";
  } else {
    // cityMatch undefined — unknown, apply maximum conservative buffer
    travelBuffer = TRAVEL_NO_DISTANCE_CROSS_CITY_MIN + expansion;
    distanceReason = "too_soon_no_distance_city_unknown";
    resolvedConfidence = "low";
  }

  const totalBuffer = MINIMUM_OPERATIONAL_BUFFER_MIN + travelBuffer;
  const earliestAllowedAt = new Date(nowMs + totalBuffer * 60_000);

  if (slotMs >= earliestAllowedAt.getTime()) {
    return {
      feasible: true,
      earliestAllowedAt,
      appliedBufferMinutes: totalBuffer,
      reason: "ok",
      confidence: resolvedConfidence,
    };
  }

  // Infeasible — determine binding constraint:
  // If slot fails even the MOB alone (before travel), MOB is the binding factor.
  const mobCutoffMs = nowMs + MINIMUM_OPERATIONAL_BUFFER_MIN * 60_000;
  const reason: FeasibilityReason =
    slotMs < mobCutoffMs ? "minimum_operational_buffer" : distanceReason;

  return {
    feasible: false,
    earliestAllowedAt,
    appliedBufferMinutes: totalBuffer,
    reason,
    confidence: resolvedConfidence,
  };
}

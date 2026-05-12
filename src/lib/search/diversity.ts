// src/lib/search/diversity.ts
//
// Phase 2.5A+ Task 17 — Post-scoring diversity layer.
//
// CRITICAL CONSTRAINT (per spec):
//   Diversity happens AFTER scoring. We never modify the underlying score.
//   Instead we re-order ALREADY-SORTED results so the top-N feels varied
//   without erasing the ranking signal.
//
// Two diversity dimensions:
//   - per-salon: avoids "5 slots from the same salon" spam
//   - per-service: avoids "5 identical haircuts" — important for QuickAccess
//     where the user is browsing for ideas, not a specific service
//
// Algorithm: greedy interleaving. Walk the sorted list, accept the next slot
// if it doesn't violate caps; otherwise defer it. Once cap-clean slots are
// exhausted, allow violators (this is what preserves ranking quality — we
// never DROP a high-scored slot, just shuffle order).
import type { SearchResult } from "@/types/slots";

export interface DiversityRules {
  /** Max slots from the same salonId. 0 = no cap. */
  maxPerSalon?: number;
  /** Max slots from the same serviceId. 0 = no cap. */
  maxPerService?: number;
  /** Max slots from the same service category. 0 = no cap. */
  maxPerCategory?: number;
  /** Max slots in the same city. 0 = no cap. */
  maxPerCity?: number;
  /** Max slots with the same exact startTime. 0 = no cap. */
  maxPerStartTime?: number;
}

/** Identity key for slot — used when serviceId is null. */
function serviceKey(s: SearchResult): string {
  return s.serviceId ?? `__name:${s.serviceName ?? ""}`;
}

/**
 * Re-order an already-sorted slot list to maximize diversity within the
 * configured caps WITHOUT dropping any slots. Any slots that would have
 * exceeded a cap appear after the cap-clean ones, in their original order.
 *
 * Why interleave instead of filter:
 *   - Preserves ranking signal: a high-scoring slot is never erased.
 *   - Caller-controlled limit happens AFTER this — diversifyByGreedy doesn't
 *     trim. The limit cut at the call site decides what's actually shown.
 *
 * Returns a new array; input is not mutated.
 */
export function diversifySorted(
  slots: SearchResult[],
  rules: DiversityRules,
): SearchResult[] {
  const maxSalon = rules.maxPerSalon ?? 0;
  const maxService = rules.maxPerService ?? 0;
  const maxCategory = rules.maxPerCategory ?? 0;
  const maxCity = rules.maxPerCity ?? 0;
  const maxStartTime = rules.maxPerStartTime ?? 0;

  if (
    maxSalon === 0 &&
    maxService === 0 &&
    maxCategory === 0 &&
    maxCity === 0 &&
    maxStartTime === 0
  ) {
    return slots;
  }

  const salonCounts = new Map<string, number>();
  const serviceCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const cityCounts = new Map<string, number>();
  const startTimeCounts = new Map<string, number>();

  const accepted: SearchResult[] = [];
  const deferred: SearchResult[] = [];

  for (const s of slots) {
    const sCat = s.category ?? "";
    const sCity = s.city ?? "";
    const sStartTime = s.startTime ?? "";

    const overSalon = maxSalon > 0 && (salonCounts.get(s.salonId) ?? 0) >= maxSalon;
    const overService =
      maxService > 0 && (serviceCounts.get(serviceKey(s)) ?? 0) >= maxService;
    const overCategory =
      maxCategory > 0 && sCat && (categoryCounts.get(sCat) ?? 0) >= maxCategory;
    const overCity =
      maxCity > 0 && sCity && (cityCounts.get(sCity) ?? 0) >= maxCity;
    const overStartTime =
      maxStartTime > 0 &&
      sStartTime &&
      (startTimeCounts.get(sStartTime) ?? 0) >= maxStartTime;

    if (overSalon || overService || overCategory || overCity || overStartTime) {
      deferred.push(s);
      continue;
    }

    salonCounts.set(s.salonId, (salonCounts.get(s.salonId) ?? 0) + 1);
    serviceCounts.set(serviceKey(s), (serviceCounts.get(serviceKey(s)) ?? 0) + 1);
    if (sCat) categoryCounts.set(sCat, (categoryCounts.get(sCat) ?? 0) + 1);
    if (sCity) cityCounts.set(sCity, (cityCounts.get(sCity) ?? 0) + 1);
    if (sStartTime) {
      startTimeCounts.set(sStartTime, (startTimeCounts.get(sStartTime) ?? 0) + 1);
    }
    accepted.push(s);
  }

  // Deferred slots come AFTER all cap-clean ones — original ranking order
  // preserved among them. Caller's `slice(0, limit)` decides whether to show.
  return accepted.concat(deferred);
}

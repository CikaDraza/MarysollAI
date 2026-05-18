// src/lib/geo/cityProximityRank.ts
//
// City-to-city ranking helper used as a coordinate-free fallback in slot
// fan-out (selectEffectiveCity, groupAndSortByCityPriority, cascade
// discovery). When neither the user's GPS nor the user's requested city
// are available, the *saved* city from localStorage still gives us a
// stable anchor — that's far more useful than blind popularity (Beograd
// always first regardless of where the user lives).

import { findCity, haversineKm } from "@/lib/cities";
import { canonicalCity } from "./canonicalCity";

/**
 * Haversine km between two free-form city names, using SERBIAN_CITIES
 * coordinates. Returns Infinity when either side is unknown so the
 * caller can fall through to a secondary tiebreaker (count, popularity).
 */
export function cityProximityRank(
  candidate: string | undefined,
  anchor: string | undefined,
): number {
  if (!candidate || !anchor) return Number.POSITIVE_INFINITY;
  const a = findCity(canonicalCity(candidate));
  const b = findCity(canonicalCity(anchor));
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return haversineKm(a.lat, a.lng, b.lat, b.lng);
}

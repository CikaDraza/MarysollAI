import { CITY_POPULARITY, SERBIAN_CITIES, haversineKm, findCity } from "@/lib/cities";
import type { SearchResult } from "@/types/slots";

export type EffectiveCityReason =
  | "nearest_with_exact_service"
  | "nearest_with_related_service"
  | "most_results";

export interface EffectiveCitySelection {
  city: string;
  reason: EffectiveCityReason;
}

function cityDistanceKm(
  city: string,
  userLocation?: { lat: number; lng: number },
  requestedCity?: string,
): number | undefined {
  const ref =
    userLocation ??
    (requestedCity ? findCity(requestedCity) : undefined);
  const target = findCity(city);
  if (!ref || !target) return undefined;
  return haversineKm(ref.lat, ref.lng, target.lat, target.lng);
}

export function selectEffectiveCity(input: {
  slots: SearchResult[];
  requestedCity?: string;
  reason: EffectiveCityReason;
  userLocation?: { lat: number; lng: number };
}): EffectiveCitySelection | undefined {
  const counts = new Map<string, number>();
  for (const slot of input.slots) {
    if (!slot.city) continue;
    counts.set(slot.city, (counts.get(slot.city) ?? 0) + 1);
  }

  const cities = [...counts.keys()];
  if (cities.length === 0) return undefined;

  const canUseDistance =
    Boolean(input.userLocation || input.requestedCity) &&
    cities.some((city) => cityDistanceKm(city, input.userLocation, input.requestedCity) != null);

  const sorted = cities.sort((a, b) => {
    if (canUseDistance) {
      const da = cityDistanceKm(a, input.userLocation, input.requestedCity) ?? Number.POSITIVE_INFINITY;
      const db = cityDistanceKm(b, input.userLocation, input.requestedCity) ?? Number.POSITIVE_INFINITY;
      if (Math.abs(da - db) > 1) return da - db;
    }

    const popA = CITY_POPULARITY[a] ?? 0;
    const popB = CITY_POPULARITY[b] ?? 0;
    if (popA !== popB) return popB - popA;

    return (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
  });

  return { city: sorted[0], reason: input.reason };
}

export function distanceToCityKm(
  city: string,
  userLocation?: { lat: number; lng: number },
  requestedCity?: string,
): number | undefined {
  const distance = cityDistanceKm(city, userLocation, requestedCity);
  return distance == null ? undefined : Math.round(distance);
}

export function knownCityNames(): string[] {
  return SERBIAN_CITIES.map((city) => city.name);
}

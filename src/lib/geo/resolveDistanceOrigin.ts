import type { SerbianCity } from "@/lib/cities";
import { hasGeoCoordinates } from "@/lib/geo/distance";
import type { GeoSignals } from "@/lib/geo/resolveGeoPriority";

export type DistanceOriginSource = "gps" | "city";
export const MAX_DISTANCE_GPS_ACCURACY_METERS = 10000;
export const HIGH_ACCURACY_GPS_THRESHOLD_METERS = 1000;

export interface DistanceOrigin {
  lat: number;
  lng: number;
  source: DistanceOriginSource;
  city?: string;
  accuracyMeters?: number;
}

export function resolveDistanceOrigin(
  signals: GeoSignals,
  selectedCity?: SerbianCity,
): DistanceOrigin | undefined {
  if (hasGeoCoordinates(signals.gps) && isUsableGpsForDistance(signals.gps)) {
    return {
      lat: signals.gps.lat,
      lng: signals.gps.lng,
      source: "gps",
      city: signals.gps.city,
      accuracyMeters: signals.gps.accuracyMeters,
    };
  }

  if (hasGeoCoordinates(selectedCity)) {
    return {
      lat: selectedCity.lat,
      lng: selectedCity.lng,
      source: "city",
      city: selectedCity.name,
    };
  }

  return undefined;
}

export function resolveUserLocationOrigin(
  signals: GeoSignals,
): DistanceOrigin | undefined {
  if (hasGeoCoordinates(signals.gps) && isUsableGpsForDistance(signals.gps)) {
    return {
      lat: signals.gps.lat,
      lng: signals.gps.lng,
      source: "gps",
      city: signals.gps.city,
      accuracyMeters: signals.gps.accuracyMeters,
    };
  }
  return undefined;
}

export function isUsableGpsForDistance(gps?: {
  lat?: number;
  lng?: number;
  accuracyMeters?: number;
}): boolean {
  const accuracyMeters = gps?.accuracyMeters;
  if (!hasGeoCoordinates(gps)) return false;
  if (typeof accuracyMeters !== "number") return true;
  return accuracyMeters <= MAX_DISTANCE_GPS_ACCURACY_METERS;
}

/**
 * Whether a GPS fix is precise enough to override the user's `saved` city.
 * Low-accuracy fixes (Wi-Fi triangulation, cell tower) still feed
 * isUsableGpsForDistance() (≤ 10 km is fine for sorting nearby salons) but
 * must NOT silently move the user into a different city's result set.
 */
export function isHighAccuracyGps(gps?: {
  lat?: number;
  lng?: number;
  accuracyMeters?: number;
}): boolean {
  const accuracyMeters = gps?.accuracyMeters;
  if (!hasGeoCoordinates(gps)) return false;
  if (typeof accuracyMeters !== "number") return false;
  return accuracyMeters <= HIGH_ACCURACY_GPS_THRESHOLD_METERS;
}

import type { SerbianCity } from "@/lib/cities";
import { hasGeoCoordinates } from "@/lib/geo/distance";
import type { GeoSignals } from "@/lib/geo/resolveGeoPriority";

export type DistanceOriginSource = "gps" | "ip" | "city";

export interface DistanceOrigin {
  lat: number;
  lng: number;
  source: DistanceOriginSource;
  city?: string;
}

export function resolveDistanceOrigin(
  signals: GeoSignals,
  selectedCity?: SerbianCity,
): DistanceOrigin | undefined {
  if (hasGeoCoordinates(signals.gps)) {
    return {
      lat: signals.gps.lat,
      lng: signals.gps.lng,
      source: "gps",
      city: signals.gps.city,
    };
  }

  if (hasGeoCoordinates(signals.ip)) {
    return {
      lat: signals.ip.lat,
      lng: signals.ip.lng,
      source: "ip",
      city: signals.ip.city,
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

// src/lib/geo/distance.ts

const EARTH_RADIUS_KM = 6371;

export function isValidCoordinate(value: unknown, axis: "lat" | "lng" = "lat"): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  return axis === "lat"
    ? value >= -90 && value <= 90
    : value >= -180 && value <= 180;
}

export function hasGeoCoordinates(
  value: { lat?: unknown; lng?: unknown } | null | undefined,
): value is { lat: number; lng: number } {
  return (
    value != null &&
    isValidCoordinate(value.lat, "lat") &&
    isValidCoordinate(value.lng, "lng")
  );
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function calculateDistanceKm(
  userLat: number,
  userLng: number,
  salonLat: number,
  salonLng: number,
): number {
  if (
    !isValidCoordinate(userLat, "lat") ||
    !isValidCoordinate(userLng, "lng") ||
    !isValidCoordinate(salonLat, "lat") ||
    !isValidCoordinate(salonLng, "lng")
  ) {
    return Infinity;
  }

  const dLat = toRad(salonLat - userLat);
  const dLng = toRad(salonLng - userLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(userLat)) *
      Math.cos(toRad(salonLat)) *
      Math.sin(dLng / 2) ** 2;
  const km = EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(km * 10) / 10;
}

export function calculateTravelMinutesEstimate(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return 0;
  return Math.max(3, Math.round(distanceKm * 3));
}

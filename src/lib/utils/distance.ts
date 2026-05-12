// src/lib/utils/distance.ts

const R = 6371; // Earth radius in km

export function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

/**
 * Phase 2 — Display-only distance rounding.
 * Internal sorting/filtering uses raw `getDistanceKm`. UI components call this
 * to render a friendly label. Examples:
 *   0.4 km → "<1 km"     (anything under 1 km collapses, no useless decimals)
 *   1.4 km → "~1 km"
 *   1.8 km → "~2 km"
 *   12.3 km → "~12 km"
 *   undefined → null     (caller decides whether to render anything)
 */
export function formatDistance(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km) || km < 0) return null;
  if (km < 1) return "<1 km";
  return `~${Math.round(km)} km`;
}

/**
 * Same as formatDistance but with a stricter visibility rule for situations
 * where we don't want to spam distances on locally-relevant UI. Returns null
 * when the salon is in the same city ring (under threshold km).
 */
export function formatDistanceWhenRelevant(
  km: number | null | undefined,
  hideUnderKm = 0.3,
): string | null {
  if (km == null || !Number.isFinite(km)) return null;
  if (km < hideUnderKm) return null;
  return formatDistance(km);
}

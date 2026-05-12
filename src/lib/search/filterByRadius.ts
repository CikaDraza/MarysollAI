// src/lib/search/filterByRadius.ts

import type { GeoEnrichedSearchSlot } from "./enrichGeoSignals";

export function filterByRadius(params: {
  slots: GeoEnrichedSearchSlot[];
  maxDistanceKm: number;
}): GeoEnrichedSearchSlot[] {
  const { slots, maxDistanceKm } = params;
  if (!Number.isFinite(maxDistanceKm) || maxDistanceKm < 0) return [...(slots ?? [])];

  const nearby: GeoEnrichedSearchSlot[] = [];
  const unknownDistance: GeoEnrichedSearchSlot[] = [];

  for (const slot of slots ?? []) {
    const distance = slot.distanceKm;
    if (typeof distance !== "number" || !Number.isFinite(distance)) {
      unknownDistance.push(slot);
      continue;
    }
    if (distance <= maxDistanceKm) nearby.push(slot);
  }

  return nearby.concat(unknownDistance);
}

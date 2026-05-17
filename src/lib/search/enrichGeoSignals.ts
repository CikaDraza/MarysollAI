// src/lib/search/enrichGeoSignals.ts

import type { SearchResult } from "@/types/slots";
import { isValidCoordinate } from "@/lib/geo/distance";
import { calculateDistanceScore } from "@/lib/geo/geoScore";
import { buildSlotLocationPayload } from "@/lib/geo/locationPayload";

export interface GeoSignals {
  distanceKm?: number;
  travelMinutesEstimate?: number;
  distanceScore?: number;
  mapsLink?: string;
}

export type SearchSlot = SearchResult;
export type GeoEnrichedSearchSlot = SearchSlot & GeoSignals;

function readSalonCoordinates(slot: SearchSlot): { lat?: number; lng?: number } {
  const withCoords = slot as SearchSlot & {
    salonLat?: number;
    salonLng?: number;
    lat?: number;
    lng?: number;
  };

  return {
    lat: withCoords.salonLat ?? withCoords.lat,
    lng: withCoords.salonLng ?? withCoords.lng,
  };
}

export function enrichGeoSignals(params: {
  slots: SearchSlot[];
  userLat?: number;
  userLng?: number;
  intentType?: string;
}): GeoEnrichedSearchSlot[] {
  const canMeasureFromUser =
    isValidCoordinate(params.userLat, "lat") &&
    isValidCoordinate(params.userLng, "lng");

  return (params.slots ?? []).map((slot) => {
    try {
      const { lat: salonLat, lng: salonLng } = readSalonCoordinates(slot);
      const location = buildSlotLocationPayload({
        userLat: canMeasureFromUser ? params.userLat : undefined,
        userLng: canMeasureFromUser ? params.userLng : undefined,
        salonLat,
        salonLng,
        salonAddress: slot.salonAddress,
        salonCity: slot.city,
      });
      if (!location.hasSalonLocation) return { ...slot };
      if (location.distanceKm == null) return { ...slot, mapsLink: location.mapsLink };

      return {
        ...slot,
        distanceKm: location.distanceKm,
        travelMinutesEstimate: location.travelMinutesEstimate,
        distanceScore: calculateDistanceScore({
          distanceKm: location.distanceKm,
          intentType: params.intentType,
        }),
        mapsLink: location.mapsLink,
      };
    } catch {
      return { ...slot };
    }
  });
}

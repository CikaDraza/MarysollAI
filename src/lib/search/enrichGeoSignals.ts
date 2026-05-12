// src/lib/search/enrichGeoSignals.ts

import type { SearchResult } from "@/types/slots";
import {
  calculateDistanceKm,
  calculateTravelMinutesEstimate,
  isValidCoordinate,
} from "@/lib/geo/distance";
import { calculateDistanceScore } from "@/lib/geo/geoScore";
import { createGoogleMapsLink } from "@/lib/geo/maps";

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
      const hasSalonCoords =
        isValidCoordinate(salonLat, "lat") &&
        isValidCoordinate(salonLng, "lng");

      if (!hasSalonCoords) return { ...slot };

      const mapsLink = createGoogleMapsLink(salonLat, salonLng);
      if (!canMeasureFromUser) {
        return { ...slot, mapsLink };
      }

      const distanceKm = calculateDistanceKm(
        params.userLat!,
        params.userLng!,
        salonLat,
        salonLng,
      );

      if (!Number.isFinite(distanceKm)) return { ...slot, mapsLink };

      return {
        ...slot,
        distanceKm,
        travelMinutesEstimate: calculateTravelMinutesEstimate(distanceKm),
        distanceScore: calculateDistanceScore({
          distanceKm,
          intentType: params.intentType,
        }),
        mapsLink,
      };
    } catch {
      return { ...slot };
    }
  });
}

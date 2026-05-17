import {
  calculateDistanceKm,
  calculateTravelMinutesEstimate,
  hasGeoCoordinates,
} from "@/lib/geo/distance";
import {
  createGoogleMapsLink,
  createGoogleMapsLinkFromAddress,
} from "@/lib/geo/maps";
import { formatDistance } from "@/lib/utils/distance";

export interface SlotLocationPayloadInput {
  userLat?: number;
  userLng?: number;
  salonLat?: number;
  salonLng?: number;
  salonAddress?: string;
  salonCity?: string;
}

export interface SlotLocationPayload {
  distanceKm?: number;
  distanceLabel?: string;
  travelMinutesEstimate?: number;
  travelLabel?: string;
  mapsLink?: string;
  hasSalonLocation: boolean;
}

function validCoordinate(value: unknown, axis: "lat" | "lng"): number | undefined {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric)) return undefined;
  const probe = axis === "lat" ? { lat: numeric, lng: 0 } : { lat: 0, lng: numeric };
  return hasGeoCoordinates(probe) ? numeric : undefined;
}

export function buildSlotLocationPayload(
  input: SlotLocationPayloadInput,
): SlotLocationPayload {
  const salonLat = validCoordinate(input.salonLat, "lat");
  const salonLng = validCoordinate(input.salonLng, "lng");
  const userLat = validCoordinate(input.userLat, "lat");
  const userLng = validCoordinate(input.userLng, "lng");
  const salonLocation = hasGeoCoordinates({
    lat: salonLat,
    lng: salonLng,
  })
    ? { lat: salonLat as number, lng: salonLng as number }
    : null;
  const userLocation = hasGeoCoordinates({
    lat: userLat,
    lng: userLng,
  })
    ? { lat: userLat as number, lng: userLng as number }
    : null;

  const distanceKm =
    userLocation && salonLocation
      ? calculateDistanceKm(
          userLocation.lat,
          userLocation.lng,
          salonLocation.lat,
          salonLocation.lng,
        )
      : undefined;
  const distanceLabel = formatDistance(distanceKm);
  const travelMinutesEstimate =
    distanceKm != null && Number.isFinite(distanceKm)
      ? calculateTravelMinutesEstimate(distanceKm)
      : undefined;
  const mapsLink = salonLocation
    ? createGoogleMapsLink(salonLocation.lat, salonLocation.lng)
    : createGoogleMapsLinkFromAddress(
        input.salonAddress ?? "",
        input.salonCity,
      ) || undefined;

  return {
    distanceKm:
      distanceKm != null && Number.isFinite(distanceKm) ? distanceKm : undefined,
    distanceLabel: distanceLabel ?? undefined,
    travelMinutesEstimate,
    travelLabel:
      travelMinutesEstimate != null ? `~${travelMinutesEstimate} min` : undefined,
    mapsLink,
    hasSalonLocation: Boolean(mapsLink),
  };
}

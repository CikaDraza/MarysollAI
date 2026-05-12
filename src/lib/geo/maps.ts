// src/lib/geo/maps.ts

import { isValidCoordinate } from "./distance";

export function createGoogleMapsLink(lat: number, lng: number): string {
  if (!isValidCoordinate(lat, "lat") || !isValidCoordinate(lng, "lng")) {
    return "";
  }

  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

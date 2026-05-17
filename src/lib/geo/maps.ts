// src/lib/geo/maps.ts

import { isValidCoordinate } from "./distance";

export function createGoogleMapsLink(lat: number, lng: number): string {
  if (!isValidCoordinate(lat, "lat") || !isValidCoordinate(lng, "lng")) {
    return "";
  }

  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function createGoogleMapsLinkFromAddress(
  address: string,
  city?: string,
): string {
  if (!address.trim()) return "";

  const query = [address, city]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");

  if (!query) return "";

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function createGoogleMapsDirectionsLink(params: {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
}): string {
  if (
    !isValidCoordinate(params.originLat, "lat") ||
    !isValidCoordinate(params.originLng, "lng") ||
    !isValidCoordinate(params.destinationLat, "lat") ||
    !isValidCoordinate(params.destinationLng, "lng")
  ) {
    return "";
  }

  const origin = `${params.originLat},${params.originLng}`;
  const destination = `${params.destinationLat},${params.destinationLng}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

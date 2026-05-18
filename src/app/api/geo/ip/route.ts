// src/app/api/geo/ip/route.ts
//
// Phase 2.5C Task 6 — Minimal IP-based city fallback.
//
// DESIGN:
//   - Server-side endpoint that returns { city, lat, lng } based on the
//     request's IP. Used as a LOW-PRIORITY signal by useCitySelector.
//   - Resolver priority chain ensures this never overrides explicit / gps /
//     saved choices. This endpoint just feeds the `ip` slot.
//   - Soft-fail: 200 OK with empty payload on any error. Client treats an
//     empty payload as "no signal" — never renders an error.
//
// IMPLEMENTATION:
//   We don't ship a GeoIP database. Vercel and most hosting providers expose
//   `x-vercel-ip-city` / `x-vercel-ip-country-region` / `x-vercel-ip-latitude`
//   / `x-vercel-ip-longitude` headers. We read those when present and snap
//   the city to the nearest Serbian city we know about (so it routes through
//   the same SERBIAN_CITIES table the rest of the app uses).
//
//   When headers are missing (local dev, non-Vercel hosting), we return an
//   empty payload — the client falls back to GPS/trending as expected.
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { nearestCity, SERBIAN_CITIES } from "@/lib/cities";

// Vercel-style geo headers. Other CDNs use different names; extend here when
// migrating providers.
const HEADER_CITY = "x-vercel-ip-city";
const HEADER_LAT = "x-vercel-ip-latitude";
const HEADER_LNG = "x-vercel-ip-longitude";
const HEADER_COUNTRY = "x-vercel-ip-country";

export const dynamic = "force-dynamic";

interface IpGeoResponse {
  city: string | null;
  lat: number | null;
  lng: number | null;
}

const EMPTY: IpGeoResponse = { city: null, lat: null, lng: null };

export function resolveIpGeoFromHeaders(h: Pick<Headers, "get">): IpGeoResponse {
  const country = h.get(HEADER_COUNTRY);
  if (country && country.toUpperCase() !== "RS") {
    return EMPTY;
  }

  const rawLat = h.get(HEADER_LAT);
  const rawLng = h.get(HEADER_LNG);
  const rawCity = h.get(HEADER_CITY);

  const lat = rawLat ? Number(rawLat) : NaN;
  const lng = rawLng ? Number(rawLng) : NaN;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  let city: string | null = null;
  if (hasCoords) {
    city = nearestCity(lat, lng).name;
  } else if (rawCity) {
    let decodedCity = rawCity;
    try {
      decodedCity = decodeURIComponent(rawCity.replace(/\+/g, " "));
    } catch {
      decodedCity = rawCity;
    }
    const lower = decodedCity.toLowerCase();
    const match = SERBIAN_CITIES.find(
      (c) => c.name.toLowerCase() === lower,
    );
    if (match) {
      city = match.name;
    }
  }

  return {
    city,
    lat: hasCoords ? lat : null,
    lng: hasCoords ? lng : null,
  };
}

export async function GET() {
  try {
    const h = await headers();
    return NextResponse.json<IpGeoResponse>(resolveIpGeoFromHeaders(h));
  } catch {
    // Soft-fail — never block rendering with an IP geo error.
    return NextResponse.json(EMPTY);
  }
}

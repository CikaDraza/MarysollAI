// GET /api/cities — dynamic city catalog for the client.
// Proxies the platform marketplace cities (only cities with visible salons),
// hydrates the server-side catalog, and returns the merged list (with static
// coordinate backfill) for the client CityCatalog provider.
import { NextResponse } from "next/server";
import { ensureCityCatalog } from "@/lib/cities-runtime";
import { SERBIAN_CITIES, CITY_POPULARITY, STATIC_SERBIAN_CITIES } from "@/lib/cities";

export async function GET() {
  try {
    await ensureCityCatalog();
  } catch {
    // ensureCityCatalog already soft-fails; SERBIAN_CITIES stays static.
  }

  const source = SERBIAN_CITIES.length > 0 ? SERBIAN_CITIES : STATIC_SERBIAN_CITIES;
  const cities = source.map((c) => ({
    name: c.name,
    lat: c.lat,
    lng: c.lng,
    popularityScore: CITY_POPULARITY[c.name] ?? 0,
  }));

  return NextResponse.json(cities, {
    headers: {
      "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
    },
  });
}

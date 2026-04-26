// src/app/api/salons/route.ts
import { NextResponse } from "next/server";
import { platformClient } from "@/lib/api/platformClient";
import { mapSalon } from "@/lib/mappers/salonMapper";
import { getDistanceKm } from "@/lib/utils/distance";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city") ?? undefined;
  const lat = searchParams.get("lat") ? Number(searchParams.get("lat")) : undefined;
  const lng = searchParams.get("lng") ? Number(searchParams.get("lng")) : undefined;

  try {
    const raw = await platformClient.getSalonProfiles({ city, lat, lng });
    const salons = raw.map((r) => {
      const s = mapSalon(r);
      if (lat != null && lng != null && r.lat != null && r.lng != null) {
        s.distanceKm = getDistanceKm(lat, lng, r.lat, r.lng);
      }
      return s;
    });
    return NextResponse.json(salons);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch salons" },
      { status: 500 },
    );
  }
}

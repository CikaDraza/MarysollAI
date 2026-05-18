// src/app/api/salons/route.ts
import { NextResponse } from "next/server";
import { platformClient, convertWorkingHours } from "@/lib/api/platformClient";
import { mapSalon } from "@/lib/mappers/salonMapper";
import { getDistanceKm } from "@/lib/utils/distance";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city") ?? undefined;
  const lat = searchParams.get("lat") ? Number(searchParams.get("lat")) : undefined;
  const lng = searchParams.get("lng") ? Number(searchParams.get("lng")) : undefined;

  try {
    const rawProfiles = await platformClient.getSalonProfiles({ city, lat, lng });

    // Fetch working hours + full service data (with type/variants) per salon in parallel
    const raw = await Promise.all(
      rawProfiles.map(async (s) => {
        const id = s.id ?? s._id ?? "";
        if (!id) return s;
        const [wh, fullServices] = await Promise.allSettled([
          platformClient.getSalonWorkingHours(id),
          platformClient.getSalonServices(id),
        ]);
        return {
          ...s,
          ...(wh.status === "fulfilled" ? { workingHours: convertWorkingHours(wh.value) } : {}),
          ...(fullServices.status === "fulfilled" && fullServices.value.length > 0
            ? { services: fullServices.value }
            : {}),
        };
      }),
    );

    console.log(`\n[/api/salons] ══ SalonProfile DB (city="${city ?? "ALL"}", total=${raw.length}) ══`);
    for (const s of raw) {
      const id = s.id ?? s._id ?? "?";
      const svcs = (s.services ?? []).map((sv) => {
        const cat = sv.category ?? "?";
        const dur = sv.duration ?? "?";
        return `"${sv.name}"[${cat},${dur}min]`;
      }).join(" | ") || "—";
      const slots = (s.nextSlots ?? []).map((ns) => ns.startTime.slice(11, 16)).join(", ") || "—";
      const wh = s.workingHours ? JSON.stringify(s.workingHours) : "—";
      console.log(`  [${id}] "${s.name}" | city:${s.city ?? "?"} | services:${(s.services ?? []).length} | nextSlots:${(s.nextSlots ?? []).length}`);
      console.log(`    svcs: ${svcs}`);
      console.log(`    nextSlots: ${slots}`);
      console.log(`    workingHours: ${wh}`);
    }
    console.log(`[/api/salons] ══ end dump ══\n`);

    const salons = raw.map((r) => {
      const s = mapSalon(r);
      if (lat != null && lng != null && r.lat != null && r.lng != null) {
        s.distanceKm = getDistanceKm(lat, lng, r.lat, r.lng);
      }
      return s;
    });
    return NextResponse.json(salons, {
      headers: {
        // Salon profile data (working hours, services, location) changes
        // rarely. A 1 min CDN cache absorbs the homepage's salon fan-out
        // for every visitor while still picking up edits within minutes.
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch salons" },
      { status: 500 },
    );
  }
}

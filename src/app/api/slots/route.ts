// src/app/api/slots/route.ts
import { NextResponse } from "next/server";
import { platformClient } from "@/lib/api/platformClient";
import { mapSlot } from "@/lib/mappers/salonMapper";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const salonId = searchParams.get("salonId");
  const serviceId = searchParams.get("serviceId") ?? undefined;
  const date = searchParams.get("date") ?? undefined;

  if (!salonId) {
    return NextResponse.json({ error: "salonId required" }, { status: 400 });
  }

  try {
    const raw = await platformClient.getAvailableSlots({ salonId, serviceId, date });
    return NextResponse.json(raw.map(mapSlot), {
      headers: {
        // Slot availability is volatile but identical for everyone hitting
        // the same (salonId, serviceId, date) tuple. A 30 s CDN window plus
        // 60 s stale-while-revalidate cuts platform load without making
        // race-conditions worse than they already are — BookingModal still
        // recovers from 409 conflicts when a slot is taken concurrently.
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch slots" },
      { status: 500 },
    );
  }
}

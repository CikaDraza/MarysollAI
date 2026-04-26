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
    return NextResponse.json(raw.map(mapSlot));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch slots" },
      { status: 500 },
    );
  }
}

// src/app/api/external/services/route.ts
// Proxies to marketplace/services — requires salonId, returns [] if missing
import { NextResponse } from "next/server";
import { platformClient } from "@/lib/api/platformClient";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const salonId = searchParams.get("salonId");

  if (!salonId) return NextResponse.json([]);

  try {
    const services = await platformClient.getSalonServices(salonId);
    return NextResponse.json(Array.isArray(services) ? services : []);
  } catch {
    return NextResponse.json([]);
  }
}

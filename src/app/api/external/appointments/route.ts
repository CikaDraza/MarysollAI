// src/app/api/external/appointments/route.ts
import { NextResponse } from "next/server";
import { platformHeaders } from "@/lib/api/platformHeaders";

export async function GET(req: Request) {
  const MAIN_SITE_API = process.env.MAIN_SITE_API;

  try {
    const { searchParams } = new URL(req.url);
    const authHeader = req.headers.get("authorization") ?? "";
    const externalUrl = `${MAIN_SITE_API}/appointments?${searchParams.toString()}`;

    const response = await fetch(externalUrl, {
      headers: platformHeaders({ Authorization: authHeader }),
    });

    return NextResponse.json(await response.json());
  } catch (error) {
    console.error("Error fetching appointments:", error);
    return NextResponse.json({ error: "Error fetching appointments" }, { status: 500 });
  }
}

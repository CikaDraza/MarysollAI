// src/app/api/external/appointments/create/route.ts
import { NextResponse } from "next/server";
import { platformHeaders } from "@/lib/api/platformHeaders";

export async function POST(req: Request) {
  const MAIN_SITE_API = process.env.MAIN_SITE_API;
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const body = await req.json();

    const response = await fetch(`${MAIN_SITE_API}/appointments/create`, {
      method: "POST",
      headers: platformHeaders({ Authorization: authHeader }),
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Bridge Error:", error);
    return NextResponse.json({ error: "Greška u mostu ka API-ju" }, { status: 500 });
  }
}

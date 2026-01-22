// src/app/api/external/appointments/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const SITE_API = process.env.MAIN_SITE_API;
  try {
    const authHeader = req.headers.get("authorization");
    const body = await req.json();

    const res = await fetch(`${SITE_API}/appointments/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader || "",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json(
      { error: error || "External API Error" },
      { status: 500 },
    );
  }
}

// src/app/api/external/services/route.ts
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query");

  const SITE_API = process.env.MAIN_SITE_API;

  try {
    const response = await fetch(`${SITE_API}/services?search=${query}`, {
      next: { revalidate: 60 },
    });
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error || "External fetch failed" },
      { status: 500 },
    );
  }
}

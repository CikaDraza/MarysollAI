// src/app/api/external/marketplace/salons/route.ts
import { NextResponse } from "next/server";
import { platformHeaders } from "@/lib/api/platformHeaders";

export async function GET() {
  const MAIN_SITE_API = process.env.PLATFORM_API_URL;

  try {
    const response = await fetch(`${MAIN_SITE_API}/marketplace/salons`, {
      headers: platformHeaders(),
      next: { revalidate: 3600 },
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch profile",
      },
      { status: 500 },
    );
  }
}

// src/app/api/external/salon-profile/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  const MAIN_SITE_API = process.env.MAIN_SITE_API;

  try {
    const response = await fetch(`${MAIN_SITE_API}/salon-profile`, {
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

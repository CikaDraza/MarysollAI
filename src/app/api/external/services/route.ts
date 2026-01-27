// src/app/api/external/services/route.ts
import { connectToDB } from "@/lib/db/mongodb";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query");
  const MAIN_SITE_API = process.env.MAIN_SITE_API;

  try {
    await connectToDB();
    const response = await fetch(`${MAIN_SITE_API}/services?query=${query}`, {
      next: { revalidate: 60 },
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "External fetch failed",
      },
      { status: 500 },
    );
  }
}

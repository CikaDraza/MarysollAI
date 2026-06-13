// GET /api/ai/catalog
//
// Serializable CatalogData za klijentski intent leksikon (AgentEntryRouter).
// Sadrži SAMO imena/sinonime — bez cena, telefona ili drugih detalja.

import { NextResponse } from "next/server";
import { ensureCityCatalog } from "@/lib/cities-runtime";
import { fetchPlatformKnowledge } from "@/lib/ai/platform-knowledge";
import { catalogDataFromPlatformKnowledge } from "@/lib/ai/catalog/catalog-context";

export async function GET() {
  try {
    await ensureCityCatalog();
    const platform = await fetchPlatformKnowledge();
    const data = catalogDataFromPlatformKnowledge(platform);
    // Klijentu ne treba pun spisak usluga sa salonima — imena i sinonimi su
    // dovoljni za prepoznavanje namere.
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("[api/ai/catalog] failed:", error);
    return NextResponse.json(
      { cities: [], salons: [], services: [], categories: [] },
      { status: 200 },
    );
  }
}

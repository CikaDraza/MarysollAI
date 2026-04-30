// Na platformi (Marysoll)
import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/db/mongodb";
import { Category } from "@/models/Category";

export async function GET(req: NextRequest) {
  try {
    await connectToDB();

    const categories = await Category.find({ isActive: true })
      .select("key label synonyms subcategories popularityScore")
      .lean();

    return NextResponse.json(categories);
  } catch (err) {
    console.error("[GET /api/marketplace/categories]", err);
    return NextResponse.json(
      { error: "Greška pri učitavanju kategorija" },
      { status: 500 },
    );
  }
}

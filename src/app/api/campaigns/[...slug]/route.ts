import { connectToDB } from "@/lib/db/mongodb";
import { buildCampaignLookupQuery } from "@/lib/server/campaignLookup";
import { NewsletterCampaign } from "@/models/NewsletterCampaign";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string[] }> },
) {
  try {
    await connectToDB();
    const { slug } = await context.params;
    const campaign = await NewsletterCampaign.findOne(
      buildCampaignLookupQuery(slug),
    ).lean();

    if (!campaign) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(campaign);
  } catch (error) {
    console.error("[api/campaigns/[...slug]] failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Campaign fetch failed" },
      { status: 500 },
    );
  }
}

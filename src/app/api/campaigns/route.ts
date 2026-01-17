// ai-landing/src/app/api/campaigns/route.ts
import { connectToDB } from "@/lib/db/mongodb";
import { NewsletterCampaign } from "@/models/NewsletterCampaign";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await connectToDB();

    const campaigns = await NewsletterCampaign.find({
      campaignType: "email-landing",
      "landingPage.enabled": true,
      "landingPage.status": "published",
    });
    if (!campaigns) {
      return NextResponse.json({ error: "Not any campaign" }, { status: 403 });
    }

    return NextResponse.json(campaigns);
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    return NextResponse.json(
      { error: "Error fetching campaigns" },
      { status: 500 }
    );
  }
}

// ai-landing/src/app/api/campaigns/[slug]/route.ts
import { normalizeCampaignSlug } from "@/helpers/slugNormalizer";
import { connectToDB } from "@/lib/db/mongodb";
import { NewsletterCampaign } from "@/models/NewsletterCampaign";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string[] }> }
) {
  await connectToDB();
  const { slug } = await context.params;
  const { slugId, fullPath } = normalizeCampaignSlug(slug);
  const campaign = await NewsletterCampaign.findOne({
    campaignType: "email-landing",
    $or: [
      { "landingPage.slug": fullPath },
      { "landingPage.slug": `/${slugId}` },
      { ctaSlug: `/newsletter/${slugId}` },
    ],
  }).lean();

  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(campaign);
}

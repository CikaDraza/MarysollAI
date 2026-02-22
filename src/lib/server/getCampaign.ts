// lib/server/getCampaign.ts
import { normalizeCampaignSlug } from "@/helpers/slugNormalizer";
import { NewsletterCampaign } from "@/models/NewsletterCampaign";
import { cache } from "react";
import { connectToDB } from "../db/mongodb";

export const getCampaign = cache(async (slug: string) => {
  await connectToDB();
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
    return null;
  }
  return JSON.parse(JSON.stringify(campaign));
});

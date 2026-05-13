import { NewsletterCampaign } from "@/models/NewsletterCampaign";
import { cache } from "react";
import { connectToDB } from "../db/mongodb";
import { buildCampaignLookupQuery } from "./campaignLookup";

export const getCampaign = cache(async (slug: string) => {
  try {
    await connectToDB();
    const campaign = await NewsletterCampaign.findOne(
      buildCampaignLookupQuery(slug),
    ).lean();

    if (!campaign) {
      return null;
    }
    return JSON.parse(JSON.stringify(campaign));
  } catch (error) {
    console.error("[getCampaign] failed", {
      slug,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
});

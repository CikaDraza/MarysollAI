import type { BlogTeaserSection } from "@/types/editorial";
import type { CategorySlug } from "@/lib/intent/categoryMap";
import {
  buildCategorySection,
  buildEditorialSections,
  buildHomepageSection,
  dedupeTeasers,
  getStaticTenantTeasers,
} from "./getEditorialTeasers";
import { getPublishedCampaignTeasers } from "./getCampaignTeasers";

// Server-only: pulls published campaigns from the DB and merges them with the
// curated salon (tenant) teasers. DB campaigns lead so freshly published posts
// surface first; the static tenant posts fill in behind them.
async function getMergedTeasers() {
  const [dbCards, tenantCards] = [
    await getPublishedCampaignTeasers(),
    getStaticTenantTeasers(),
  ];
  return dedupeTeasers([...dbCards, ...tenantCards]);
}

/** /blog — audience-segmented sections (Beauty trendovi + Postani partner). */
export async function getEditorialTeaserSections(): Promise<
  BlogTeaserSection[]
> {
  return buildEditorialSections(await getMergedTeasers());
}

/** Homepage / city hub — single mixed-audience "Beauty trendovi" section. */
export async function getHomepageEditorialTeaserSection(): Promise<BlogTeaserSection> {
  return buildHomepageSection(await getMergedTeasers());
}

/** /[city]/[categorySlug] — category-led client section, or null. */
export async function getCategoryEditorialTeaserSection(
  slug: CategorySlug,
): Promise<BlogTeaserSection | null> {
  return buildCategorySection(slug, await getMergedTeasers());
}

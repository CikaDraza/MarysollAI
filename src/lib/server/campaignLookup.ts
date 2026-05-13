import { normalizeCampaignSlug } from "@/helpers/slugNormalizer";

function unique(values: Array<string | undefined>) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => Boolean(value))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

export function buildCampaignLookupQuery(slug: string | string[]) {
  const { slugId, fullPath } = normalizeCampaignSlug(slug);
  const pathWithoutSlash = fullPath.replace(/^\/+/, "");

  const landingSlugValues = unique([
    fullPath,
    pathWithoutSlash,
    `/${slugId}`,
    slugId,
    `/blog${fullPath}`,
    `blog${fullPath}`,
    `/blog/${slugId}`,
    `blog/${slugId}`,
  ]);

  const ctaSlugValues = unique([
    fullPath,
    pathWithoutSlash,
    `/${slugId}`,
    slugId,
    `/blog/${slugId}`,
    `blog/${slugId}`,
  ]);

  return {
    campaignType: "email-landing",
    "landingPage.enabled": true,
    "landingPage.status": "published",
    $or: [
      { "landingPage.slug": { $in: landingSlugValues } },
      { ctaSlug: { $in: ctaSlugValues } },
    ],
  };
}

export interface NormalizedSlug {
  raw: string[];
  slugId: string;
  fullPath: string;
}

export function normalizeCampaignSlug(slug: string[] | string): NormalizedSlug {
  const segments = Array.isArray(slug) ? slug : [slug];

  const slugId = segments.at(-1);
  if (!slugId) {
    throw new Error("Invalid campaign slug");
  }

  return {
    raw: segments,
    slugId,
    fullPath: `/${segments.join("/")}`,
  };
}

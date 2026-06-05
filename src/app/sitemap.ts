import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/constants";
import { getIndexableCombos } from "@/lib/seo/indexability";
import { fetchSearchSalonProfiles } from "@/lib/search/fetchSearchPlatformData";
import { mapSalon } from "@/lib/mappers/salonMapper";
import { ensureCityCatalog } from "@/lib/cities-runtime";

// Regenerate at most hourly; salon inventory and city catalog change slowly.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/uslovi-koriscenja`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/politika-privatnosti`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];

  // Ensure dynamic cities are in the catalog before generating city slugs.
  await ensureCityCatalog().catch(() => {});

  const [combos, salonProfiles] = await Promise.all([
    getIndexableCombos().catch(() => []),
    fetchSearchSalonProfiles({ limit: 200 }).catch(() => []),
  ]);

  const categoryRoutes: MetadataRoute.Sitemap = combos.map((c) => ({
    url: `${SITE_URL}/${c.citySlug}/${c.urlSlug}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  const salonRoutes: MetadataRoute.Sitemap = salonProfiles
    .map((p) => mapSalon(p).slug)
    .filter((slug): slug is string => Boolean(slug))
    .map((slug) => ({
      url: `${SITE_URL}/salons/${slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

  return [...staticRoutes, ...categoryRoutes, ...salonRoutes];
}

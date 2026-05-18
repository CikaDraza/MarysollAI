// src/lib/ai/platform-knowledge.ts
import { unstable_cache } from "next/cache";
import {
  platformClient,
  PlatformSalon,
  PlatformService,
} from "@/lib/api/platformClient";
import { PlatformCategory } from "@/types/category-types";

export interface PlatformKnowledge {
  salonsText: string;
  servicesText: string;
  citiesText: string;
  categoriesText: string;
}

function formatSalons(salons: PlatformSalon[]): string {
  if (!salons.length) return "Nema dostupnih salona.";
  return salons
    .map((s) => {
      const id = s._id || s.id || "?";
      const city = s.city || "N/A";
      const phone = s.phone || "N/A";
      const slug = s.slug || "";
      return `- [${id}] ${s.name} | Grad: ${city} | Tel: ${phone}${slug ? ` | Slug: ${slug}` : ""}`;
    })
    .join("\n");
}

function formatServices(services: PlatformService[]): string {
  if (!services.length) return "Nema dostupnih usluga.";
  return services
    .map((s) => {
      const id = s._id || s.id || "?";
      const price = s.basePrice ?? s.price ?? "N/A";
      const duration = s.duration ?? "N/A";
      const category = s.category || "N/A";
      return `- [${id}] ${s.name} | Kategorija: ${category} | Cena: ${price} RSD | Trajanje: ${duration} min`;
    })
    .join("\n");
}

function formatCategories(categories: PlatformCategory[]): string {
  if (!categories.length) return "Nema dostupnih kategorija.";
  return categories
    .map((c) => {
      const subs = c.subcategories?.map((s) => s.label).join(", ") || "";
      const synonyms = c.synonyms?.slice(0, 3).join(", ") || "";
      return `- ${c.label} (${c.key})${subs ? ` | Podkategorije: ${subs}` : ""}${synonyms ? ` | Sinonimi: ${synonyms}` : ""}`;
    })
    .join("\n");
}

function deriveCities(salons: PlatformSalon[]): string {
  const cities = [
    ...new Set(salons.map((s) => s.city).filter(Boolean) as string[]),
  ];
  return cities.length ? cities.join(", ") : "Beograd, Novi Sad, Niš, Bor";
}

async function _fetchPlatformKnowledge(): Promise<PlatformKnowledge> {
  let salons: PlatformSalon[] = [];
  let categories: PlatformCategory[] = [];
  let services: PlatformService[] = [];

  try {
    [salons, categories] = await Promise.all([
      platformClient.getSalonProfiles().catch(() => []),
      platformClient.getCategories().catch(() => []),
    ]);

    const salonIds = salons
      .slice(0, 5)
      .map((s) => (s._id || s.id) as string)
      .filter(Boolean);

    if (salonIds.length > 0) {
      const serviceArrays = await Promise.all(
        salonIds.map((id) =>
          platformClient.getSalonServices(id).catch(() => []),
        ),
      );
      services = serviceArrays.flat();
    }
  } catch (error) {
    console.error("[fetchPlatformKnowledge] Error:", error);
  }

  return {
    salonsText: formatSalons(salons),
    servicesText: formatServices(services),
    citiesText: deriveCities(salons),
    categoriesText: formatCategories(categories),
  };
}

// Cached at the Next.js data layer — survives across serverless invocations.
// Batch 3 — TTL dropped to 5 min and tagged so platform-side mutations
// (new salon service, edited synonyms) can call
// revalidateTag("category-synonyms") for near-instant propagation.
export const fetchPlatformKnowledge = unstable_cache(
  _fetchPlatformKnowledge,
  ["platform-knowledge"],
  { revalidate: 300, tags: ["category-synonyms", "platform-knowledge"] },
);

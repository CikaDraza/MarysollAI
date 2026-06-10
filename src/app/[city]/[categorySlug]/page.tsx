// src/app/[city]/[categorySlug]/page.tsx
// URL shape: /novi-sad/frizura  (city slug × category slug)
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LandingPage from "@/components/landing/LandingPage";
import { CategorySeoContent } from "@/components/seo/CategorySeoContent";
import { resolveCategoryUrlSlug } from "@/lib/seo/categoryUrlSlug";
import { getCategoryCopy, getCategoryMeta } from "@/lib/seo/categoryCopy";
import {
  getCategoryIndexability,
  getCategoryPageData,
} from "@/lib/seo/indexability";
import {
  citySlugToName,
  isAllCitiesSlug,
  ALL_CITIES_LABEL,
} from "@/lib/seo/citySlug";
import { getCategoryEditorialTeaserSection } from "@/lib/editorial/getEditorialSections";
import { ensureCityCatalog } from "@/lib/cities-runtime";
import { SITE_URL } from "@/lib/seo/constants";

// SSR with cached salon data (unstable_cache); refresh hourly.
export const revalidate = 3600;

interface Params {
  city: string;
  categorySlug: string;
}

type SearchParamsShape = Record<string, string | string[] | undefined>;

/** A filtered/faceted state (date/time query) must never be indexed. */
function isFiltered(sp: SearchParamsShape): boolean {
  return ["after", "before", "date", "time"].some((k) => sp[k] != null);
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParamsShape>;
}): Promise<Metadata> {
  const { city, categorySlug } = await params;
  const sp = await searchParams;

  await ensureCityCatalog().catch(() => {});
  const allCities = isAllCitiesSlug(city);
  const cityLabel = allCities ? ALL_CITIES_LABEL : citySlugToName(city);
  const slug = resolveCategoryUrlSlug(categorySlug);

  if (!cityLabel || !slug) {
    return { title: "Stranica nije pronađena", robots: { index: false, follow: false } };
  }

  const meta = getCategoryMeta(cityLabel, slug);
  const canonical = `${SITE_URL}/${city}/${categorySlug}`;

  // Filtered states (?after=, ?date=…) are noindex + canonical to the base path.
  // Otherwise the content-threshold gate (with manual override) decides.
  let index: boolean;
  if (isFiltered(sp)) {
    index = false;
  } else {
    const { directive } = await getCategoryIndexability(
      allCities ? null : cityLabel,
      slug,
    );
    index = directive === "index";
  }

  return {
    // Layout template appends " | Marysoll Booking".
    title: meta.title,
    description: meta.description,
    alternates: { canonical },
    openGraph: {
      title: meta.ogTitle,
      description: meta.ogDescription,
      url: canonical,
      type: "website",
    },
    twitter: { card: "summary_large_image", title: meta.ogTitle, description: meta.ogDescription },
    robots: { index, follow: true },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { city, categorySlug } = await params;

  await ensureCityCatalog().catch(() => {});
  const allCities = isAllCitiesSlug(city);
  const cityLabel = allCities ? ALL_CITIES_LABEL : citySlugToName(city);
  const slug = resolveCategoryUrlSlug(categorySlug);

  if (!cityLabel || !slug) {
    notFound();
  }

  const heroCopy = getCategoryCopy(cityLabel, slug);
  const data = await getCategoryPageData(allCities ? null : cityLabel, slug);
  const editorialTeasers =
    (await getCategoryEditorialTeaserSection(slug)) ?? undefined;

  return (
    <LandingPage
      // All-cities page seeds no city so the slot engine searches nationwide.
      initialCity={allCities ? "" : cityLabel}
      initialCategory={slug}
      heroCopy={heroCopy}
      editorialTeasers={editorialTeasers}
      seoSlot={
        <CategorySeoContent
          city={cityLabel}
          citySlug={city}
          slug={slug}
          data={data}
        />
      }
    />
  );
}

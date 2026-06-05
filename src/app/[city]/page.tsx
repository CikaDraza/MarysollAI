// src/app/[city]/page.tsx
// City hub — URL shape: /bor, /novi-sad
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LandingPage from "@/components/landing/LandingPage";
import { CitySeoContent } from "@/components/seo/CitySeoContent";
import { getCityCopy, getCityMeta } from "@/lib/seo/categoryCopy";
import { getCityIndexability, getCityPageData } from "@/lib/seo/indexability";
import { citySlugToName } from "@/lib/seo/citySlug";
import { ensureCityCatalog } from "@/lib/cities-runtime";
import { SITE_URL } from "@/lib/seo/constants";

// SSR with cached salon data (unstable_cache); refresh hourly.
export const revalidate = 3600;

interface Params {
  city: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { city } = await params;

  await ensureCityCatalog().catch(() => {});
  const cityLabel = citySlugToName(city);

  if (!cityLabel) {
    return {
      title: "Stranica nije pronađena",
      robots: { index: false, follow: false },
    };
  }

  const meta = getCityMeta(cityLabel);
  const canonical = `${SITE_URL}/${city}`;
  const { directive } = await getCityIndexability(cityLabel);

  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical },
    openGraph: {
      title: meta.ogTitle,
      description: meta.ogDescription,
      url: canonical,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: meta.ogTitle,
      description: meta.ogDescription,
    },
    robots: { index: directive === "index", follow: true },
  };
}

export default async function CityPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { city } = await params;

  await ensureCityCatalog().catch(() => {});
  const cityLabel = citySlugToName(city);

  if (!cityLabel) {
    notFound();
  }

  const heroCopy = getCityCopy(cityLabel);
  const data = await getCityPageData(cityLabel);

  return (
    <LandingPage
      initialCity={cityLabel}
      heroCopy={heroCopy}
      seoSlot={
        <CitySeoContent city={cityLabel} citySlug={city} data={data} />
      }
    />
  );
}

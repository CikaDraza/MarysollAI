import type { Metadata } from "next";
import SalonPreviewPage from "@/components/salons/SalonPreviewPage";
import { fetchSearchSalonProfiles } from "@/lib/search/fetchSearchPlatformData";
import { findSalonBySlug } from "@/lib/salons/salonPreview";
import { SITE_URL } from "@/lib/seo/constants";
import { getOverride } from "@/lib/seo/seoOverrides";

interface Params {
  slug: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const canonical = `${SITE_URL}/salons/${slug}`;

  let name = "Salon";
  let city: string | undefined;
  try {
    const profiles = await fetchSearchSalonProfiles({ limit: 200 });
    const raw = findSalonBySlug(profiles, slug);
    if (raw) {
      name = raw.name ?? name;
      city = raw.city;
    }
  } catch {
    // Soft-fail to generic copy; never block render on metadata.
  }

  const where = city ? ` u ${city}` : "";
  const title = `${name}${where} — termini, cene i kontakt`;
  const description =
    `Rezerviši termin u salonu ${name}${where} online. ` +
    `Pogledaj usluge, cenovnik, radno vreme, galeriju i utiske klijenata.`;
  const directive = getOverride(`/salons/${slug}`) ?? "index";

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: "website" },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: directive === "index", follow: true },
  };
}

export default async function SalonPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  return <SalonPreviewPage slug={slug} />;
}

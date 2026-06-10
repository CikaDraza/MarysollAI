import type { Metadata } from "next";
import Script from "next/script";
import LandingPage from "@/components/landing/LandingPage";
import { getHomepageEditorialTeaserSection } from "@/lib/editorial/getEditorialSections";

// Editorial teasers are pulled from published platform campaigns; refresh hourly.
export const revalidate = 3600;

async function getSeoMeta() {
  return {
    title:
      "Marysoll — Slobodni termini u salonima lepote i velnesa danas | Novi Sad, Beograd, Niš, Bor",
    description: "Marysoll — pronađi slobodne termine...",
    noIndex: false,
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSeoMeta();

  return {
    title: seo.title,
    description: seo.description,
    robots: seo.noIndex ? "noindex, nofollow" : "index, follow",
    openGraph: {
      title: seo.title,
      description: seo.description,
      url: `${process.env.NEXT_PUBLIC_SITE_URL}/`,
      type: "website",
      images: [
        {
          url: "/booking.marysoll.png",
          alt: "Marysoll Booking",
        },
      ],
    },
  };
}

export default async function Home() {
  const editorialTeasers = await getHomepageEditorialTeaserSection();
  return <LandingPage editorialTeasers={editorialTeasers} />;
}

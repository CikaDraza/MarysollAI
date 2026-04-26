import type { Metadata } from "next";
import Script from "next/script";
import LandingPage from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "Marysoll — Slobodni termini u salonima lepote i velnesa danas | Novi Sad, Beograd, Niš, Bor",
  description:
    "Marysoll — pronađi slobodne termine u salonima lepote i velnesa u Novom Sadu, Beogradu, Nišu i Boru. Manikir, masaža, šišanje, šminka — rezerviši bez poziva, danas.",
  keywords: [
    "saloni lepote", "termini", "manikir", "masaža", "šišanje", "šminka",
    "Novi Sad", "Beograd", "Niš", "Bor", "rezervacija", "online",
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: "https://marysoll.rs/" },
  openGraph: {
    type: "website",
    locale: "sr_RS",
    siteName: "Marysoll",
    title: "Slobodni termini u salonima lepote i velnesa — danas",
    description: "Pronađi i rezerviši stručnjake za lepotu i velnes u svom gradu. Bez poziva, bez čekanja.",
    url: "https://marysoll.rs/",
    images: [{ url: "https://marysoll.rs/og.jpg" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Marysoll — saloni lepote i velnesa",
    description: "Slobodni termini u realnom vremenu. Rezerviši odmah.",
  },
};

const jsonLdWebSite = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Marysoll",
  url: "https://marysoll.rs/",
  inLanguage: "sr-Latn-RS",
  potentialAction: {
    "@type": "SearchAction",
    target: "https://marysoll.rs/pretraga?q={search_term_string}",
    "query-input": "required name=search_term_string",
  },
};

const jsonLdOrg = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Marysoll",
  url: "https://marysoll.rs/",
  logo: "https://marysoll.rs/logo.svg",
  areaServed: ["Novi Sad", "Beograd", "Niš", "Bor"],
  sameAs: [
    "https://www.instagram.com/marysoll",
    "https://www.tiktok.com/@marysoll",
  ],
};

export default function Home() {
  return (
    <>
      <Script
        id="ld-website"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdWebSite) }}
      />
      <Script
        id="ld-org"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdOrg) }}
      />
      <LandingPage />
    </>
  );
}

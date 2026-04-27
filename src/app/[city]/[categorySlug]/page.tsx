// src/app/[city]/[categorySlug]/page.tsx
// URL shape: /novi-sad/massage
import type { Metadata } from "next";
import LandingPage from "@/components/landing/LandingPage";
import { getCategoryLabel } from "@/lib/categories/getCategoryLabel";

interface Params {
  city: string;
  categorySlug: string;
}

function decodeCity(s: string) {
  return decodeURIComponent(s).replace(/-/g, " ");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { city, categorySlug } = await params;
  const cityLabel = decodeCity(city);
  const catLabel = getCategoryLabel(categorySlug);
  return {
    title: `${catLabel} · ${cityLabel} – Marysoll`,
    description: `Slobodni termini za ${catLabel} u ${cityLabel}. Rezerviši odmah — bez poziva.`,
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { city, categorySlug } = await params;
  return (
    <LandingPage
      initialCity={decodeCity(city)}
      initialCategory={categorySlug}
    />
  );
}

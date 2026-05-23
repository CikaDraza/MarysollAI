import type { Metadata } from "next";
import SalonPreviewPage from "@/components/salons/SalonPreviewPage";

interface Params {
  slug: string;
}

export const metadata: Metadata = {
  title: "Salon preview | Marysoll Booking",
  description:
    "Pregled salona, galerija, kontakt, radno vreme, mapa, utisci i termini na Marysoll Booking platformi.",
};

export default async function SalonPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  return <SalonPreviewPage slug={slug} />;
}

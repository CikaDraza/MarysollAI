"use client";

// Emits BeautySalon + AggregateRating for the salon profile. Gated on a visible
// rating (reviewCount ≥ 1) so the schema never claims a rating the page doesn't
// show. Rendered client-side — the profile loads testimonials on the client.
import { JsonLdScript } from "@/components/seo/JsonLdScript";
import { salonAggregateJsonLd } from "@/lib/seo/jsonLd";

export function SalonJsonLd({
  name,
  slug,
  city,
  averageRating,
  reviewCount,
}: {
  name: string;
  slug: string;
  city?: string | null;
  averageRating: number | null;
  reviewCount: number;
}) {
  if (averageRating == null || reviewCount < 1) return null;
  return (
    <JsonLdScript
      data={salonAggregateJsonLd({
        name,
        slug,
        city,
        averageRating,
        reviewCount,
      })}
    />
  );
}

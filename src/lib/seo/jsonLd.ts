// Schema.org JSON-LD builders. Pure functions → plain objects, serialized by
// <JsonLdScript>. No aggregateRating yet (rating source not confirmed — see plan
// step 6); these are the "safe structure" signals: Breadcrumb, FAQPage, ItemList.

import { SITE_URL } from "@/lib/seo/constants";
import type { SalonCardData } from "@/lib/seo/indexability";
import type { FaqItem } from "@/lib/seo/faq";

type JsonLd = Record<string, unknown>;

export function breadcrumbJsonLd(
  crumbs: { name: string; path: string }[],
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${SITE_URL}${c.path}`,
    })),
  };
}

export function faqPageJsonLd(items: FaqItem[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.question,
      acceptedAnswer: { "@type": "Answer", text: it.answer },
    })),
  };
}

/**
 * BeautySalon for a salon profile, WITH aggregateRating. Emit only when the
 * rating is visible on the page and reviewCount ≥ 1 (caller gates this).
 */
export function salonAggregateJsonLd(opts: {
  name: string;
  slug: string;
  city?: string | null;
  averageRating: number;
  reviewCount: number;
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BeautySalon",
    name: opts.name,
    url: `${SITE_URL}/salons/${opts.slug}`,
    ...(opts.city
      ? {
          address: {
            "@type": "PostalAddress",
            addressLocality: opts.city,
            addressCountry: "RS",
          },
        }
      : {}),
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: opts.averageRating.toFixed(1),
      reviewCount: opts.reviewCount,
      bestRating: 5,
      worstRating: 1,
    },
  };
}

/** ItemList of recommended salons. AggregateRating only when reviewCount ≥ 1. */
export function salonItemListJsonLd(salons: SalonCardData[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: salons.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "BeautySalon",
        name: s.name,
        url: `${SITE_URL}/salons/${s.slug}`,
        ...(s.city
          ? {
              address: {
                "@type": "PostalAddress",
                addressLocality: s.city,
                addressCountry: "RS",
              },
            }
          : {}),
        ...(s.minPrice != null
          ? { priceRange: `od ${s.minPrice.toLocaleString("sr-RS")} RSD` }
          : {}),
        ...(s.reviewCount != null && s.reviewCount >= 1 && s.rating != null
          ? {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: s.rating.toFixed(1),
                reviewCount: s.reviewCount,
                bestRating: 5,
                worstRating: 1,
              },
            }
          : {}),
      },
    })),
  };
}

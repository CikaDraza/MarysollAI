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

/** ItemList of recommended salons. Each item is a BeautySalon — WITHOUT rating. */
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
      },
    })),
  };
}

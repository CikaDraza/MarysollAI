// Public Serbian URL slug  ↔  internal CategorySlug.
//
// The URL is the SEO surface (e.g. /bor/frizura) and uses Serbian terms people
// actually search. Internal logic (categoryMap, indexability, copy) keys off the
// English CategorySlug ("hair"). This module bridges the two so there is exactly
// ONE canonical public slug per category.

import type { CategorySlug } from "@/lib/intent/categoryMap";

/** Canonical public (Serbian) slug for each category. */
export const CATEGORY_TO_URL_SLUG: Record<CategorySlug, string> = {
  hair: "frizura",
  nails: "manikir",
  makeup: "sminkanje",
  massage: "masaza",
  waxing: "depilacija",
  eyebrows: "obrve",
  facial: "tretman-lica",
  body: "oblikovanje-tela",
  other: "ostalo",
};

const URL_SLUG_TO_CATEGORY: Record<string, CategorySlug> = Object.fromEntries(
  Object.entries(CATEGORY_TO_URL_SLUG).map(
    ([cat, url]) => [url, cat as CategorySlug],
  ),
) as Record<string, CategorySlug>;

/** Common alternate spellings that should still resolve (non-canonical). */
const URL_SLUG_ALIASES: Record<string, CategorySlug> = {
  nokti: "nails",
  pedikir: "nails",
  frizer: "hair",
  sisanje: "hair",
  sminka: "makeup",
  masaze: "massage",
};

export function resolveCategoryUrlSlug(
  urlSlug: string,
): CategorySlug | undefined {
  return URL_SLUG_TO_CATEGORY[urlSlug] ?? URL_SLUG_ALIASES[urlSlug];
}

export function categoryToUrlSlug(cat: CategorySlug): string {
  return CATEGORY_TO_URL_SLUG[cat];
}

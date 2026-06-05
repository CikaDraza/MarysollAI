// Builds the dynamic Hero copy (eyebrow, H1, subtitle) for a city × category
// page. This is what kills the duplicate-H1 problem: every /{city}/{category}
// gets a unique, keyword-rich heading. FAQ variants will reuse CATEGORY_KEYWORDS
// in a later phase.

import type { CategorySlug } from "@/lib/intent/categoryMap";
import { CATEGORY_KEYWORDS } from "@/lib/seo/categoryKeywords";
import { cityLocative } from "@/lib/seo/cityGrammar";

export interface CategoryCopy {
  eyebrow: string;
  /** H1 text. Named `title` so it spreads straight into Hero's `title` prop. */
  title: string;
  subtitle: string;
}

export function getCategoryCopy(
  cityLabel: string,
  slug: CategorySlug,
): CategoryCopy {
  const { h1Noun, keywords } = CATEGORY_KEYWORDS[slug];
  const lead = keywords.slice(0, 3).join(", ");
  const inCity = cityLocative(cityLabel);

  return {
    eyebrow: `Marysoll · ${cityLabel}`,
    title: `${h1Noun} u ${inCity} – slobodni termini danas`,
    subtitle: `Pronađite slobodne termine za ${lead} u ${inCity}. Rezerviši online, bez poziva i čekanja.`,
  };
}

/** Hero copy for a city hub page (/bor). H1 shows the city in locative case. */
export function getCityCopy(cityLabel: string): CategoryCopy {
  const inCity = cityLocative(cityLabel);
  return {
    eyebrow: `Marysoll · ${cityLabel}`,
    title: `Slobodni termini u ${inCity} danas`,
    subtitle: `Pronađi salone i slobodne termine u ${inCity}. Frizeri, manikir, masaža, šminkanje i drugi beauty tretmani — rezerviši online bez poziva.`,
  };
}

export interface CategoryMeta {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
}

/** SEO metadata text for a city hub page (/bor). */
export function getCityMeta(cityLabel: string): CategoryMeta {
  const inCity = cityLocative(cityLabel);
  return {
    title: `Saloni lepote i slobodni termini u ${inCity}`,
    description: `Pronađi salone lepote i slobodne termine u ${inCity}. Frizeri, manikir, masaža, šminka i depilacija — rezerviši online, bez poziva i čekanja.`,
    ogTitle: `Saloni i slobodni termini u ${inCity}`,
    ogDescription: `Rezerviši termin u salonima lepote u ${inCity} online, bez poziva i čekanja.`,
  };
}

/**
 * SEO metadata text for a city × category page. Uses the human keyword noun
 * (e.g. "Frizura") rather than the platform label ("Kosa") for search relevance.
 */
export function getCategoryMeta(
  cityLabel: string,
  slug: CategorySlug,
): CategoryMeta {
  const { h1Noun } = CATEGORY_KEYWORDS[slug];
  const noun = h1Noun.toLowerCase();
  const inCity = cityLocative(cityLabel);

  return {
    title: `${h1Noun} u ${inCity} – slobodni termini online`,
    description: `Pronađi slobodne termine za ${noun} u ${inCity}. Pogledaj salone, cene i termine, pa rezerviši online bez poziva.`,
    ogTitle: `${h1Noun} u ${inCity} – slobodni termini online`,
    ogDescription: `Rezerviši ${noun} u ${inCity} online, bez poziva i čekanja.`,
  };
}

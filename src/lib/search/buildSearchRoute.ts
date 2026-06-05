// Search → canonical route.
//
// Turns a free-text query ("Šminkanje u Boru sutra posle 14") into the
// SEO-canonical path the user should land on:
//   city only            → /bor
//   city + category       → /bor/sminkanje
//   + date/time filters   → /bor/sminkanje?date=tomorrow&after=14
//
// Parsing priority: city → category → date/time → URL.
// "salon", "saloni", "beauty"… are NEUTRAL words (a salon-discovery intent),
// never a category — so "Saloni u Boru" resolves to the city hub /bor.

import { parseIntent, stripDiacritics } from "@/lib/intent/parseIntent";
import type { CategorySlug } from "@/lib/intent/categoryMap";
import { cityToSlug } from "@/lib/seo/citySlug";
import { categoryToUrlSlug } from "@/lib/seo/categoryUrlSlug";

export const NEUTRAL_SEARCH_WORDS = [
  "salon",
  "saloni",
  "beauty",
  "kozmeticki",
  "kozmetički",
  "termin",
  "termini",
  "slobodni",
  "zakazivanje",
];

const NEUTRAL_NORM = new Set(NEUTRAL_SEARCH_WORDS.map((w) => stripDiacritics(w)));

/** Strip neutral discovery words so they are never mistaken for a service. */
function removeNeutralWords(query: string): string {
  return query
    .split(/\s+/)
    .filter((token) => {
      const norm = stripDiacritics(token.replace(/[^\p{L}\d]/gu, ""));
      return norm.length > 0 && !NEUTRAL_NORM.has(norm);
    })
    .join(" ");
}

/** Open-ended "posle/nakon/after X" → hour, else null. ("oko 15" is a window, not after.) */
function detectAfterHour(query: string): number | null {
  const norm = stripDiacritics(query);
  const m = norm.match(/\b(?:posle|nakon|after)\s*(\d{1,2})(?::\d{2})?\s*h?\b/);
  if (!m) return null;
  const hour = Number(m[1]);
  return Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

export interface BuiltRoute {
  path: string;
  /** True when date/time query params were attached (these pages are noindex). */
  filtered: boolean;
}

export interface RouteParts {
  /** Display city name (e.g. "Kruševac"); null/undefined falls back to contextCity. */
  city?: string | null;
  category?: CategorySlug | null;
  /** Only "tomorrow" emits a date param; today is the default (no param). */
  date?: "today" | "tomorrow" | null;
  afterHour?: number | null;
}

/**
 * Compose a canonical route from already-resolved parts. Shared by the local
 * query parser and the API-intent path so both produce identical URLs.
 * `contextCity` (the current explicitly-chosen city) is used only when no city
 * is given. Returns null when no city can be resolved.
 */
export function composeRoute(
  parts: RouteParts,
  contextCity?: string,
): BuiltRoute | null {
  const cityName = parts.city ?? contextCity;
  if (!cityName) return null;

  const citySlug = cityToSlug(cityName);

  // City-only intent → city hub. Time filters are ignored here (the hub is a
  // directory, not a slot list).
  if (!parts.category) {
    return { path: `/${citySlug}`, filtered: false };
  }

  const categorySlug = categoryToUrlSlug(parts.category);
  const params = new URLSearchParams();
  if (parts.date === "tomorrow") params.set("date", "tomorrow");
  if (parts.afterHour != null) params.set("after", String(parts.afterHour));

  const qs = params.toString();
  return {
    path: `/${citySlug}/${categorySlug}${qs ? `?${qs}` : ""}`,
    filtered: qs.length > 0,
  };
}

/**
 * Build the canonical route for a free-text query. `contextCity` is the current
 * explicitly chosen city (route/manual), used only when the query names no city.
 * Returns null when no city can be resolved (caller keeps in-place search).
 */
export function buildSearchRoute(
  query: string,
  contextCity?: string,
): BuiltRoute | null {
  const intent = parseIntent(removeNeutralWords(query));
  return composeRoute(
    {
      city: intent.city,
      category: intent.category,
      date: intent.datetime.type === "tomorrow" ? "tomorrow" : null,
      afterHour: detectAfterHour(query),
    },
    contextCity,
  );
}

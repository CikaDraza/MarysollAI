// Stable mapping between a city's display name (with diacritics, e.g. "Niš",
// "Novi Sad") and its ASCII URL slug ("nis", "novi-sad"). Backed by the live
// city catalog (SERBIAN_CITIES), which is hydrated from the platform via
// ensureCityCatalog() and falls back to STATIC_SERBIAN_CITIES.
//
// Call ensureCityCatalog() before relying on these for dynamically-added cities;
// the static catalog already covers the main Serbian cities.

import { SERBIAN_CITIES } from "@/lib/cities";
import { stripDiacritics } from "@/lib/intent/parseIntent";

/** "Novi Sad" → "novi-sad", "Niš" → "nis", "Sremska Mitrovica" → "sremska-mitrovica". */
export function cityToSlug(name: string): string {
  return stripDiacritics(name).replace(/\s+/g, "-");
}

function findCityBySlug(slug: string) {
  const norm = stripDiacritics(decodeURIComponent(slug).replace(/-/g, " ")).trim();
  return SERBIAN_CITIES.find((c) => stripDiacritics(c.name) === norm);
}

/** "novi-sad" → "Novi Sad" (canonical display name), or null if unknown. */
export function citySlugToName(slug: string): string | null {
  return findCityBySlug(slug)?.name ?? null;
}

/** True when the slug resolves to a known city in the catalog. */
export function isKnownCitySlug(slug: string): boolean {
  return findCityBySlug(slug) != null;
}

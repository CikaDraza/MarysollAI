// src/lib/intent/serviceSynonyms.ts
//
// Phase 2 — Service-level synonym normalization.
// Batch 3  — Dynamic DB-driven overlay.
//
// CategoryMap covers high-level categories ("kosa", "nokti", ...). This layer
// handles SERVICE NAMES across Serbian + English + mixed input so the search/
// ranking pipeline matches "haircut", "šišanje", "shisanje", and "sisanje" to
// the same canonical token.
//
// Two sources, in priority order at lookup time:
//   1. Dynamic map built from PlatformCategory.subcategories[].synonyms (DB)
//   2. Static fallback table below (hardcoded, edited rarely)
//
// The dynamic map is built by callers that have access to the categories
// payload (server routes, AI knowledge layer) and passed in via the
// `dynamicMap` argument. Callers without DB access still get correct results
// from the static fallback.

import type { PlatformCategory } from "@/types/category-types";
import { stripDiacritics } from "./parseIntent";
import { findFuzzyMatch } from "./fuzzyMatch";

/**
 * Each entry maps a canonical Serbian token (lowercase, diacritics-stripped)
 * to its synonyms — also lowercase and diacritics-stripped. The canonical
 * token is what we use for downstream matching.
 */
const SERVICE_SYNONYMS: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  // Hair
  ["sisanje", ["haircut", "cut", "stiznja", "sisat", "saje"]],
  ["farbanje", ["color", "coloring", "boja", "boja kose", "farba"]],
  ["fen", ["blowout", "blowdry", "fen frizura", "fenarica"]],
  ["pranje", ["hair wash", "wash", "shampoo", "saponiranje"]],
  ["pramenovi", ["highlights", "balayage", "ombre", "babe"]],

  // Nails
  ["manikir", ["manicure", "nokti", "ruke", "nail", "nails"]],
  ["pedikir", ["pedicure", "noge", "stopala"]],
  ["gel lak", ["gel", "gel polish", "shellac", "trajni lak"]],
  ["nadogradnja", ["nail extension", "extensions", "akrilik", "akril", "naxxx"]],

  // Lashes & brows
  ["trepavice", ["lashes", "eyelashes", "lash lift", "extensions trepavice"]],
  ["obrve", ["brows", "eyebrows", "henna obrve", "lamination"]],

  // Face & makeup
  ["sminkanje", ["makeup", "make-up", "make up", "shminka", "minka"]],
  ["tretman lica", ["facial", "facials", "face treatment", "lice"]],
  ["depilacija", ["waxing", "wax", "epilacija", "voskovanje"]],

  // Massage & wellness
  ["masaza", ["massage", "spa", "relaks", "relax", "thai"]],

  // Bridal
  ["mladenacka", ["bridal", "wedding", "svadbena"]],
];

/** Stable shape consumers can pass around. Keys + values are pre-normalized
 * (lowercase, diacritics stripped, trimmed). */
export type SynonymCanonicalMap = ReadonlyMap<string, string>;

function normalizeKey(token: string): string {
  return stripDiacritics(token.toLowerCase()).trim();
}

// Static fallback map built once at module init.
const STATIC_MAP: SynonymCanonicalMap = (() => {
  const m = new Map<string, string>();
  for (const [canonical, synonyms] of SERVICE_SYNONYMS) {
    const canonicalKey = normalizeKey(canonical);
    m.set(canonicalKey, canonicalKey);
    for (const syn of synonyms) {
      const k = normalizeKey(syn);
      if (k.length > 0) m.set(k, canonicalKey);
    }
  }
  return m;
})();

/**
 * Build a synonym map from the live PlatformCategory[] payload. Walks every
 * category's subcategories[] and maps each subcategory key + label + synonyms
 * to that subcategory's key as the canonical token.
 *
 * The dynamic map is intended to be merged on top of the static fallback —
 * dynamic entries win on conflict because the DB is the platform's source of
 * truth (a salon may have added "akrilne nadogradnje" with custom synonyms
 * that we shouldn't override with the curated list here).
 */
export function buildDynamicSynonymMap(
  categories: PlatformCategory[] | undefined | null,
): SynonymCanonicalMap {
  if (!categories?.length) return new Map();
  const m = new Map<string, string>();
  for (const cat of categories) {
    for (const sub of cat.subcategories ?? []) {
      const canonical = normalizeKey(sub.key || sub.label || "");
      if (!canonical) continue;
      m.set(canonical, canonical);
      const labelKey = normalizeKey(sub.label);
      if (labelKey) m.set(labelKey, canonical);
      for (const syn of sub.synonyms ?? []) {
        const k = normalizeKey(syn);
        if (k) m.set(k, canonical);
      }
    }
  }
  return m;
}

/** Lookup helper. Dynamic map wins; static is fallback. After exact-match
 * miss, falls back to Levenshtein fuzzy search across both map keys —
 * catches typos like "šišanj" → "sisanje", "manukur" → "manikir". */
function lookup(
  key: string,
  dynamicMap: SynonymCanonicalMap | undefined,
): string | undefined {
  const exact = dynamicMap?.get(key) ?? STATIC_MAP.get(key);
  if (exact !== undefined) return exact;

  // Fuzzy fallback — walk dynamic keys first (DB wins on conflicts) then
  // static. `findFuzzyMatch` returns null for inputs too short to be
  // unambiguous, so this is safe to call on every miss.
  if (dynamicMap && dynamicMap.size > 0) {
    const hit = findFuzzyMatch(key, dynamicMap.keys());
    if (hit) return dynamicMap.get(hit);
  }
  const staticHit = findFuzzyMatch(key, STATIC_MAP.keys());
  if (staticHit) return STATIC_MAP.get(staticHit);

  return undefined;
}

/**
 * Returns the canonical service token for `input`, or the normalized input
 * itself when no synonym matches. Always lowercase, no diacritics.
 *
 * Pass `dynamicMap` (built via `buildDynamicSynonymMap(categories)`) when DB
 * synonyms should take priority over the static fallback.
 *
 * Examples:
 *   normalizeServiceQuery("Šišanje") → "sisanje"
 *   normalizeServiceQuery("haircut") → "sisanje"
 *   normalizeServiceQuery("masaža")  → "masaza"
 *   normalizeServiceQuery("xyz")     → "xyz"  (passthrough)
 */
export function normalizeServiceQuery(
  input: string,
  dynamicMap?: SynonymCanonicalMap,
): string {
  if (!input) return "";
  const k = normalizeKey(input);
  return lookup(k, dynamicMap) ?? k;
}

/**
 * Token-level normalization: splits on whitespace, normalizes each token
 * independently, joins back. Useful when the user types a phrase that
 * contains both category and service synonyms, e.g. "haircut i farbanje".
 */
export function normalizeServicePhrase(
  phrase: string,
  dynamicMap?: SynonymCanonicalMap,
): string {
  if (!phrase) return "";
  return phrase
    .split(/\s+/)
    .map((tok) => normalizeServiceQuery(tok, dynamicMap))
    .filter(Boolean)
    .join(" ");
}

/**
 * Returns true when `query` is a known service synonym. Useful for AI intent
 * routing — if the user says "haircut", we can confidently route to the
 * booking flow with `service: "sisanje"` pre-filled.
 */
export function isKnownService(
  query: string,
  dynamicMap?: SynonymCanonicalMap,
): boolean {
  if (!query) return false;
  const k = normalizeKey(query);
  return lookup(k, dynamicMap) !== undefined;
}

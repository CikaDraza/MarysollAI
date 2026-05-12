// src/lib/intent/serviceSynonyms.ts
//
// Phase 2 — Service-level synonym normalization.
//
// CategoryMap already covers high-level categories ("kosa", "nokti", ...).
// This layer handles SERVICE NAMES across Serbian + English + mixed input
// so the search/ranking pipeline matches "haircut", "šišanje", "shisanje",
// and "sisanje" to the same canonical token.
//
// Used by:
//   - normalizeSearch (query token normalization)
//   - findBestSlots (service matching)
//   - AI intent extraction (Maria payload + Claudia booking flow)
//
// NOTE: keep this list curated and small. The platform owns the authoritative
// service catalog; this is a query-side normalization layer, not a thesaurus.

import { stripDiacritics } from "./parseIntent";

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

// Build the inverse map at module init.
// All keys are stripped of diacritics + lowercased.
const SYNONYM_TO_CANONICAL: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [canonical, synonyms] of SERVICE_SYNONYMS) {
    const canonicalKey = stripDiacritics(canonical.toLowerCase()).trim();
    m.set(canonicalKey, canonicalKey);
    for (const syn of synonyms) {
      const k = stripDiacritics(syn.toLowerCase()).trim();
      if (k.length > 0) m.set(k, canonicalKey);
    }
  }
  return m;
})();

/**
 * Returns the canonical service token for `input`, or the normalized input
 * itself when no synonym matches. Always lowercase, no diacritics.
 *
 * Examples:
 *   normalizeServiceQuery("Šišanje") → "sisanje"
 *   normalizeServiceQuery("haircut") → "sisanje"
 *   normalizeServiceQuery("masaža")  → "masaza"
 *   normalizeServiceQuery("xyz")     → "xyz"  (passthrough)
 */
export function normalizeServiceQuery(input: string): string {
  if (!input) return "";
  const k = stripDiacritics(input.toLowerCase()).trim();
  return SYNONYM_TO_CANONICAL.get(k) ?? k;
}

/**
 * Token-level normalization: splits on whitespace, normalizes each token
 * independently, joins back. Useful when the user types a phrase that
 * contains both category and service synonyms, e.g. "haircut i farbanje".
 */
export function normalizeServicePhrase(phrase: string): string {
  if (!phrase) return "";
  return phrase
    .split(/\s+/)
    .map((tok) => normalizeServiceQuery(tok))
    .filter(Boolean)
    .join(" ");
}

/**
 * Returns true when `query` is a known service synonym. Useful for AI intent
 * routing — if the user says "haircut", we can confidently route to the
 * booking flow with `service: "sisanje"` pre-filled.
 */
export function isKnownService(query: string): boolean {
  if (!query) return false;
  const k = stripDiacritics(query.toLowerCase()).trim();
  return SYNONYM_TO_CANONICAL.has(k);
}

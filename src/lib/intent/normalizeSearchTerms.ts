// src/lib/intent/normalizeSearchTerms.ts
//
// Phase 2.5A — Unified synonym + term normalization entry point.
//
// Existing pieces (intentionally unchanged):
//   - stripDiacritics()        — lowercase + diacritic removal
//   - CATEGORY_MAP             — category synonyms (kosa, nokti, ...)
//   - normalizeServiceQuery()  — service-level synonyms (Phase 2)
//   - SERBIAN_CITIES           — city table
//
// This module composes them into a single normalized-search bundle, used by:
//   - rankSearchResults() (Phase 2.5A unified adapter)
//   - findBestSlots indirect (via NormalizedSearch which is computed
//     separately; we keep this compatible by exposing both raw + canonical
//     forms here)
//   - AI intent extraction
//
// Goal: any search surface that takes free-text input runs it through
// normalizeSearchTerms() once and gets all forms it needs.
import { stripDiacritics } from "./parseIntent";
import { CATEGORY_MAP, type CategorySlug } from "./categoryMap";
import {
  normalizeServiceQuery,
  normalizeServicePhrase,
  type SynonymCanonicalMap,
} from "./serviceSynonyms";

export interface NormalizedTerms {
  /** Original input, unchanged. Useful for debug. */
  raw: string;
  /** Lowercase + diacritic-stripped + trimmed. */
  normalized: string;
  /** Service token after synonym lookup (e.g. "haircut" → "sisanje"). */
  canonicalService: string;
  /** Phrase-level normalization for multi-word inputs. */
  canonicalPhrase: string;
  /** Detected category slug (e.g. "hair", "nails") if any synonym matches. */
  category: CategorySlug | null;
  /** Token list extracted from the phrase — useful for prefix matching. */
  tokens: string[];
}

/** Lookup category from CATEGORY_MAP via any synonym match. */
function detectCategoryFromText(norm: string): CategorySlug | null {
  for (const [slug, synonyms] of CATEGORY_MAP) {
    for (const syn of synonyms) {
      if (norm.includes(syn)) return slug;
    }
  }
  return null;
}

/**
 * Run a free-text query through every normalization layer once.
 * Always safe to call with empty/undefined input.
 */
export function normalizeSearchTerms(
  input: string | undefined,
  dynamicMap?: SynonymCanonicalMap,
): NormalizedTerms {
  const raw = input ?? "";
  if (!raw.trim()) {
    return {
      raw,
      normalized: "",
      canonicalService: "",
      canonicalPhrase: "",
      category: null,
      tokens: [],
    };
  }

  const normalized = stripDiacritics(raw);
  const tokens = normalized.split(/\s+/).filter(Boolean);

  return {
    raw,
    normalized,
    canonicalService: normalizeServiceQuery(raw, dynamicMap),
    canonicalPhrase: normalizeServicePhrase(raw, dynamicMap),
    category: detectCategoryFromText(normalized),
    tokens,
  };
}

/**
 * Convenience: returns true when `query` matches `target` against any
 * normalization layer (raw/canonical service/phrase). Useful for service-name
 * matching in the search engine without forcing every match site to call
 * stripDiacritics + normalize manually.
 */
export function matchesNormalized(
  query: string,
  target: string,
  dynamicMap?: SynonymCanonicalMap,
): boolean {
  if (!query || !target) return false;
  const q = normalizeSearchTerms(query, dynamicMap);
  const t = normalizeSearchTerms(target, dynamicMap);
  if (!q.normalized || !t.normalized) return false;
  if (t.normalized.includes(q.normalized)) return true;
  if (q.canonicalService && t.canonicalService === q.canonicalService) return true;
  if (q.canonicalPhrase && t.canonicalPhrase.includes(q.canonicalPhrase)) return true;
  return false;
}

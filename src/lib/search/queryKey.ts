// src/lib/search/queryKey.ts
//
// Phase 2.5C Task 3 — Single source of truth for the search queryKey shape.
//
// PROBLEM SOLVED:
//   Previously useSearch.buildQueryKey() and HomepagePreloader.buildSearchKey()
//   were manually aligned. If someone added a new filter to useSearch but
//   forgot the preloader, the preload silently became useless (cache miss).
//
//   Now both import buildSearchQueryKey from here. Any future filter is
//   added in ONE place and both sides stay in sync automatically.
//
// CONVENTIONS (preserved from useSearch):
//   - All unset filters serialize to "" (empty string), not undefined.
//   - Numeric undefined serializes to "" (matches the original empty-string
//     convention so existing cache entries remain valid).
//   - Order of array elements MUST match between writes and reads; do not
//     re-order without invalidating the entire cache.

export interface SearchQueryKeyInput {
  city?: string;
  category?: string;
  subcategory?: string;
  date?: string;
  time?: string;
  timeWindowStart?: number;
  timeWindowEnd?: number;
  lat?: number;
  lng?: number;
}

const EMPTY = "";

/**
 * Canonical search queryKey builder. TanStack Query keys are compared by
 * deep equality, so this returns a readonly tuple with stable shape.
 *
 * If you add a new filter:
 *   1. Add to SearchQueryKeyInput
 *   2. Append it to the end of the returned tuple (NOT in the middle —
 *      that would invalidate all in-flight + cached queries)
 *   3. Both useSearch + HomepagePreloader pick it up automatically.
 */
export function buildSearchQueryKey(
  input: SearchQueryKeyInput,
): readonly unknown[] {
  return [
    "search",
    input.city ?? EMPTY,
    input.category ?? EMPTY,
    input.subcategory ?? EMPTY,
    input.date ?? EMPTY,
    input.time ?? EMPTY,
    input.timeWindowStart ?? EMPTY,
    input.timeWindowEnd ?? EMPTY,
    input.lat ?? EMPTY,
    input.lng ?? EMPTY,
  ];
}

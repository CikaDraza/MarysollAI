// src/lib/search/preloadSearch.ts
//
// Phase 2.5A+ Task 20 — Homepage warmup.
//
// Calls the existing search endpoints + popularity index in parallel and
// caches them via cachedFetch (Phase 2.5A). The user's first paint should
// be instant: while React renders QuickAccess + BookingWidget shells, the
// data arrives from cache instead of triggering fresh network requests.
//
// CRITICAL CONSTRAINT (per spec):
//   Do NOT block initial UI render. Always returns immediately on first
//   call — caller doesn't await the network. Subsequent reads via the same
//   cache key get the warmed value.
import { cachedFetch, getPopularityIndex, type PopularityIndex } from "./popularSearchCache";
import { aiLog } from "@/lib/ai/debug-log";

const log = aiLog("SEARCH_ENGINE");

export interface PreloadInput {
  /** Resolved geo (from resolveGeoPriority). Used as cache key + fetch param. */
  city?: string;
  lat?: number;
  lng?: number;
  /** Optional fetcher overrides. When omitted, defaults hit the existing API. */
  fetchers?: {
    quickaccess?: () => Promise<unknown>;
    bookingwidget?: () => Promise<unknown>;
    popularity?: () => Promise<PopularityIndex>;
  };
}

/** Cache TTL — keep things warm for ~2 minutes on the homepage. */
const PRELOAD_TTL = 2 * 60_000;

/**
 * Default search fetcher — hits the existing /api/search endpoint with the
 * resolved geo as query params. Caller can override via `input.fetchers`.
 */
function defaultSearchFetcher(input: PreloadInput): () => Promise<unknown> {
  return async () => {
    const qs = new URLSearchParams();
    if (input.city) qs.set("city", input.city);
    if (input.lat != null) qs.set("lat", String(input.lat));
    if (input.lng != null) qs.set("lng", String(input.lng));
    const res = await fetch(`/api/search?${qs.toString()}`);
    if (!res.ok) throw new Error(`search preload failed: ${res.status}`);
    return res.json();
  };
}

/** Cache key derived from the resolved geo. Different cities → different keys. */
function makeKey(prefix: string, input: PreloadInput): string {
  return `${prefix}:${input.city ?? "_"}:${input.lat ?? "_"}:${input.lng ?? "_"}`;
}

/**
 * Trigger preload in the background. Returns immediately — caller should
 * call this in a useEffect (client) or RSC (server). Never throws.
 */
export function preloadSearch(input: PreloadInput): void {
  log("preload.kickoff", { city: input.city ?? "—" });

  const search =
    input.fetchers?.quickaccess ??
    input.fetchers?.bookingwidget ??
    defaultSearchFetcher(input);

  // Fire-and-forget — caller is not awaiting these. The cache holds the
  // results when QuickAccess/BookingWidget query for them.
  void cachedFetch(makeKey("preload_search", input), search, {
    staleAfterMs: PRELOAD_TTL,
    persist: true,
  }).catch((err) => log("preload.search_failed", { error: String(err) }));

  if (input.fetchers?.popularity) {
    void getPopularityIndex(input.fetchers.popularity).catch((err) =>
      log("preload.popularity_failed", { error: String(err) }),
    );
  }
}

/**
 * Awaitable version — useful in tests or in RSC where we want to block on
 * the first read. Production homepage code should prefer `preloadSearch`.
 */
export async function preloadSearchAwait(
  input: PreloadInput,
): Promise<{ search: unknown; popularity: PopularityIndex | null }> {
  const search = input.fetchers?.quickaccess
    ? await cachedFetch(
        makeKey("preload_search", input),
        input.fetchers.quickaccess,
        { staleAfterMs: PRELOAD_TTL, persist: true },
      )
    : null;

  const popularity = input.fetchers?.popularity
    ? await getPopularityIndex(input.fetchers.popularity)
    : null;

  return { search, popularity };
}

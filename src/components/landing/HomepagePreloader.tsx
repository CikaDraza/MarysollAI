// src/components/landing/HomepagePreloader.tsx
//
// Phase 2.5B Tasks 4–5 — Homepage warmup, cache-reuse-correct.
//
// useSearch() consumes TanStack Query with a specific queryKey shape. To
// satisfy Task 5 ("Consumers MUST read the SAME cache keys"), we warm
// TanStack's cache via queryClient.prefetchQuery — NOT the standalone
// cachedFetch from popularSearchCache.ts (which is for non-TanStack
// consumers).
//
// Behavior:
//   - Renders nothing.
//   - Fires once on mount + once when resolved geo changes.
//   - Fire-and-forget: never blocks, never throws.
//   - Same queryKey shape as useSearch → QuickAccess/BookingWidget instantly
//     read the prefetched result instead of triggering their own fetch.
"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCityContext } from "@/context/landing/CityContext";
import type { SearchApiResponse } from "@/types/slots";
import { aiLog } from "@/lib/ai/debug-log";
import { buildSearchQueryKey } from "@/lib/search/queryKey";
import { resolveDistanceOrigin } from "@/lib/geo/resolveDistanceOrigin";

const log = aiLog("SEARCH_ENGINE");

async function fetchSearchPreload(opts: {
  city?: string;
  savedCity?: string;
  lat?: number;
  lng?: number;
}): Promise<SearchApiResponse> {
  const qs = new URLSearchParams();
  if (opts.city) qs.set("city", opts.city);
  if (opts.savedCity && opts.savedCity !== opts.city) {
    qs.set("savedCity", opts.savedCity);
  }
  if (opts.lat != null) qs.set("lat", String(opts.lat));
  if (opts.lng != null) qs.set("lng", String(opts.lng));
  const res = await fetch(`/api/search?${qs.toString()}`);
  if (!res.ok) throw new Error(`preload failed: ${res.status}`);
  return (await res.json()) as SearchApiResponse;
}

/**
 * Mount this once inside the providers tree (after CityProvider and
 * QueryClientProvider). It does the warmup silently; consumers benefit
 * automatically because they read from TanStack's cache.
 */
export default function HomepagePreloader() {
  const queryClient = useQueryClient();
  const { city, cityName, geoSignals, geoReady } = useCityContext();

  const distanceOrigin = resolveDistanceOrigin(geoSignals, city);
  const lat = distanceOrigin?.lat;
  const lng = distanceOrigin?.lng;
  const searchCity = cityName;
  const savedCity = geoSignals.saved?.city;

  useEffect(() => {
    if (!geoReady) return;
    if (!searchCity) return;

    log("preload.start", { city: searchCity, source: distanceOrigin?.source ?? "none" });

    void queryClient
      .prefetchQuery({
        queryKey: buildSearchQueryKey({ city: searchCity, savedCity, lat, lng }),
        queryFn: () =>
          fetchSearchPreload({ city: searchCity, savedCity, lat, lng }),
        staleTime: 1000 * 60 * 2, // match useSearch staleTime
      })
      .then(() => log("preload.complete", { city: searchCity }))
      .catch((err) => log("preload.failed", { error: String(err) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoReady, searchCity, savedCity, lat, lng]);

  return null;
}

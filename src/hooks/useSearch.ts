// src/hooks/useSearch.ts
"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { SearchApiResponse, SearchResult } from "@/types/slots";
import { buildSearchQueryKey } from "@/lib/search/queryKey";
import { trackSearchEvent } from "@/lib/search/searchAnalytics";

export interface SearchParams {
  city?: string;
  category?: string;
  subcategory?: string;
  query?: string;
  service?: string;
  routeCategory?: string;
  date?: string;
  time?: string;
  timeWindowStart?: number;
  timeWindowEnd?: number;
  lat?: number;
  lng?: number;
  limit?: number;
}

/** Groups search results by city (≤2 cities nearest to the requested city). */
export interface CitySlots {
  city: string;
  slots: SearchResult[];
}

async function fetchSearch(params: SearchParams): Promise<SearchApiResponse> {
  const qs = new URLSearchParams();
  if (params.city) qs.set("city", params.city);
  if (params.category) qs.set("category", params.category);
  if (params.subcategory) qs.set("subcategory", params.subcategory);
  if (params.query) qs.set("query", params.query);
  if (params.service) qs.set("service", params.service);
  if (params.routeCategory) qs.set("routeCategory", params.routeCategory);
  if (params.date) qs.set("date", params.date);
  if (params.time) qs.set("time", params.time);
  if (params.timeWindowStart != null)
    qs.set("timeWindowStart", String(params.timeWindowStart));
  if (params.timeWindowEnd != null)
    qs.set("timeWindowEnd", String(params.timeWindowEnd));
  if (params.lat != null) qs.set("lat", String(params.lat));
  if (params.lng != null) qs.set("lng", String(params.lng));
  if (params.limit) qs.set("limit", String(params.limit));

  const url = `/api/search?${qs.toString()}`;
  console.log("[useSearch] fetch →", url);
  console.log("[useSearch] params:", params);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const data = res.json() as Promise<SearchApiResponse>;
  void data.then((d) => {
    console.log(
      "[🔧 Slot Engine]",
      JSON.stringify(
        {
          fallbackLevel: d.fallbackLevel,
          totalResults: d.results.length,
          slotsByCity: d.slotsByCity.map((g) => ({
            city: g.city,
            count: g.slots.length,
            services: [
              ...new Set(g.slots.slice(0, 5).map((s) => s.serviceName)),
            ],
          })),
          debug: d.debug,
        },
        null,
        2,
      ),
    );
  });
  return data;
}

export function useSearch(params: SearchParams = {}) {
  const query = useQuery<SearchApiResponse>({
    queryKey: buildSearchQueryKey(params),
    queryFn: () => fetchSearch(params),
    staleTime: 1000 * 60 * 2, // 2 min — slots change frequently
    refetchOnWindowFocus: true,
    retry: 2,
  });

  const data = query.data;

  // Phase 2.5C Task 4 — Fallback acceptance analytics.
  // When the search returns a fallback level > 1 (i.e. results came from a
  // relaxed query), we instrument exposure. The `converted: false` event
  // fires immediately; if the user later clicks a slot, that's tracked via
  // the existing search.result_click event with the same fallbackLevel —
  // analytics can correlate the two by session + fallbackLevel.
  const lastTrackedLevel = useRef<number | null>(null);
  const fallbackLevel = data?.fallbackLevel ?? 0;

  useEffect(() => {
    if (!data) return;
    // Dedupe: skip when we've already tracked this exact level for this
    // result set (avoid spamming on every refetch / window-focus).
    if (lastTrackedLevel.current === fallbackLevel) return;
    lastTrackedLevel.current = fallbackLevel;

    if (fallbackLevel > 1) {
      trackSearchEvent({
        type: "search.fallback_accepted",
        level: fallbackLevel,
        converted: false,
      });
    }
  }, [data, fallbackLevel]);

  return {
    results: data?.results ?? [],
    discovery: data?.discovery ?? [],
    slotsByCity: (data?.slotsByCity ?? []) as CitySlots[],
    bestSlot: data?.bestSlot ?? null,
    fallbackLevel,
    totalSalons: data?.totalSalons ?? 0,
    suggestions: data?.suggestions ?? [],
    recoveryState: data?.recoveryState,
    debug: data?.debug,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
  };
}

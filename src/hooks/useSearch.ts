import { useQuery } from "@tanstack/react-query";
import type { SearchApiResponse, SearchResult } from "@/types/slots";

export interface SearchParams {
  city?: string;
  category?: string;
  subcategory?: string;
  date?: string;
  time?: string;
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
  if (params.city)        qs.set("city",        params.city);
  if (params.category)    qs.set("category",    params.category);
  if (params.subcategory) qs.set("subcategory", params.subcategory);
  if (params.date)        qs.set("date",        params.date);
  if (params.time)        qs.set("time",        params.time);
  if (params.lat != null) qs.set("lat",         String(params.lat));
  if (params.lng != null) qs.set("lng",         String(params.lng));
  if (params.limit)       qs.set("limit",       String(params.limit));

  const res = await fetch(`/api/search?${qs.toString()}`);
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json() as Promise<SearchApiResponse>;
}

function buildQueryKey(p: SearchParams) {
  return [
    "search",
    p.city ?? "",
    p.category ?? "",
    p.subcategory ?? "",
    p.date ?? "",
    p.time ?? "",
    p.lat ?? "",
    p.lng ?? "",
  ];
}

export function useSearch(params: SearchParams = {}) {
  const query = useQuery<SearchApiResponse>({
    queryKey: buildQueryKey(params),
    queryFn: () => fetchSearch(params),
    staleTime: 1000 * 60 * 2,       // 2 min — slots change frequently
    refetchOnWindowFocus: true,
    retry: 2,
  });

  const data = query.data;

  return {
    results:       data?.results ?? [],
    slotsByCity:   (data?.slotsByCity ?? []) as CitySlots[],
    bestSlot:      data?.bestSlot ?? null,
    fallbackLevel: data?.fallbackLevel ?? 0,
    totalSalons:   data?.totalSalons ?? 0,
    debug:         data?.debug,
    isLoading:     query.isLoading,
    isFetching:    query.isFetching,
    error:         query.error,
  };
}

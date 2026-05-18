"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useSearch, type CitySlots } from "@/hooks/useSearch";
import { useFilters } from "./FiltersContext";
import { useCityContext } from "./CityContext";
import { resolveDistanceOrigin } from "@/lib/geo/resolveDistanceOrigin";
import type { SearchResult } from "@/types/slots";
import type { SearchRecoveryState } from "@/types/searchRecovery";

interface SearchContextValue {
  /** Phase 2.5C — flat results exposed so consumers can apply
   * client-side ranking via rankSearchResults(). slotsByCity is kept
   * for backward compatibility but is server-grouped (pre-ranking). */
  results: SearchResult[];
  discovery: SearchResult[];
  slotsByCity: CitySlots[];
  bestSlot: SearchResult | null;
  fallbackLevel: number;
  suggestions: {
    label: string;
    query: string;
    city?: string;
    category?: string;
    service?: string;
    reason: string;
  }[];
  recoveryState?: SearchRecoveryState;
  debug?: Record<string, unknown>;
  isLoading: boolean;
  totalSalons: number;
}

const SearchContext = createContext<SearchContextValue | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const { city, cityName, geoSignals, geoReady } = useCityContext();
  const {
    category,
    initialCategory,
    dateFilter,
    timeFilter,
    timeWindowStart,
    timeWindowEnd,
    subcategoryFilter,
    searchQuery,
  } = useFilters();

  const distanceOrigin = resolveDistanceOrigin(geoSignals, city);

  const { results, discovery, slotsByCity, bestSlot, fallbackLevel, suggestions, recoveryState, debug, isLoading, totalSalons } = useSearch({
    city: cityName,
    // Warm anchor from localStorage. Only forwarded when distinct from the
    // active city so the server can use it as a city-to-city distance
    // anchor when GPS and explicit city are both absent.
    savedCity: geoSignals.saved?.city,
    lat: distanceOrigin?.lat,
    lng: distanceOrigin?.lng,
    category: category || undefined,
    routeCategory:
      initialCategory && category === initialCategory && !searchQuery && !subcategoryFilter
        ? initialCategory
        : undefined,
    query: searchQuery || subcategoryFilter || undefined,
    service: subcategoryFilter,
    date: dateFilter,
    time: timeFilter,
    timeWindowStart,
    timeWindowEnd,
    subcategory: subcategoryFilter,
    enabled: geoReady,
  });

  return (
    <SearchContext.Provider
      value={{
        results,
        discovery,
        slotsByCity,
        bestSlot,
        fallbackLevel,
        suggestions,
        recoveryState,
        debug,
        isLoading,
        totalSalons,
      }}
    >
      {children}
    </SearchContext.Provider>
  );
}

export function useSearchContext() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearchContext must be used within SearchProvider");
  return ctx;
}

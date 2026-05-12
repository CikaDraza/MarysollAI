"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useSearch, type CitySlots } from "@/hooks/useSearch";
import { useFilters } from "./FiltersContext";
import { useCityContext } from "./CityContext";
import type { SearchResult } from "@/types/slots";

interface SearchContextValue {
  /** Phase 2.5C — flat results exposed so consumers can apply
   * client-side ranking via rankSearchResults(). slotsByCity is kept
   * for backward compatibility but is server-grouped (pre-ranking). */
  results: SearchResult[];
  slotsByCity: CitySlots[];
  bestSlot: SearchResult | null;
  fallbackLevel: number;
  isLoading: boolean;
}

const SearchContext = createContext<SearchContextValue | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const { cityName } = useCityContext();
  const {
    category,
    dateFilter,
    timeFilter,
    timeWindowStart,
    timeWindowEnd,
    subcategoryFilter,
  } = useFilters();

  const { results, slotsByCity, bestSlot, fallbackLevel, isLoading } = useSearch({
    city: cityName,
    category: category || undefined,
    date: dateFilter,
    time: timeFilter,
    timeWindowStart,
    timeWindowEnd,
    subcategory: subcategoryFilter,
  });

  return (
    <SearchContext.Provider
      value={{ results, slotsByCity, bestSlot, fallbackLevel, isLoading }}
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

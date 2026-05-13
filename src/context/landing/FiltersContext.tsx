"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { trackSearchEvent } from "@/lib/search/searchAnalytics";

interface FiltersContextValue {
  category: string;
  initialCategory: string;
  setCategory: (v: string) => void;
  dateFilter: string | undefined;
  setDateFilter: (v: string | undefined) => void;
  timeFilter: string | undefined;
  setTimeFilter: (v: string | undefined) => void;
  timeWindowStart: number | undefined;
  setTimeWindowStart: (v: number | undefined) => void;
  timeWindowEnd: number | undefined;
  setTimeWindowEnd: (v: number | undefined) => void;
  subcategoryFilter: string | undefined;
  setSubcategoryFilter: (v: string | undefined) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  resetSearchFilters: () => void;
  applySearchSuggestion: (suggestion: {
    query: string;
    city?: string;
    category?: string;
    service?: string;
  }) => void;
  handleCategoryPick: (slug: string, cityName: string) => void;
}

const FiltersContext = createContext<FiltersContextValue | null>(null);

export function FiltersProvider({
  children,
  initialCategory,
}: {
  children: ReactNode;
  initialCategory?: string;
}) {
  const router = useRouter();
  const [category, setCategory] = useState(initialCategory ?? "");
  const [dateFilter, setDateFilter] = useState<string | undefined>(undefined);
  const [timeFilter, setTimeFilter] = useState<string | undefined>(undefined);
  const [timeWindowStart, setTimeWindowStart] = useState<number | undefined>(undefined);
  const [timeWindowEnd, setTimeWindowEnd] = useState<number | undefined>(undefined);
  const [subcategoryFilter, setSubcategoryFilter] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");

  const resetSearchFilters = useCallback(() => {
    setSearchQuery("");
    setSubcategoryFilter(undefined);
    setDateFilter(undefined);
    setTimeFilter(undefined);
    setTimeWindowStart(undefined);
    setTimeWindowEnd(undefined);
    setCategory(initialCategory ?? "");
  }, [initialCategory]);

  const applySearchSuggestion = useCallback(
    (suggestion: { query: string; city?: string; category?: string; service?: string }) => {
      setSearchQuery(suggestion.query);
      setCategory(suggestion.category ?? "");
      setSubcategoryFilter(suggestion.service);
      setDateFilter(undefined);
      setTimeFilter(undefined);
      setTimeWindowStart(undefined);
      setTimeWindowEnd(undefined);
    },
    [],
  );

  const handleCategoryPick = useCallback(
    (slug: string, cityName: string) => {
      const next = category === slug ? "" : slug;
      // Phase 2.5C Task 5 — service change analytics. Dedupes via the
      // category !== next guard (skipped when value unchanged).
      if (next !== category) {
        trackSearchEvent({
          type: "search.service_change",
          service: next || "(cleared)",
          from: category || undefined,
        });
      }
      setCategory(next);
      setSearchQuery("");
      setSubcategoryFilter(undefined);
      if (cityName && next) {
        router.push(`/${encodeURIComponent(cityName.toLowerCase())}/${next}`, {
          scroll: false,
        });
      }
    },
    [category, router],
  );

  return (
    <FiltersContext.Provider
      value={{
        category,
        initialCategory: initialCategory ?? "",
        setCategory,
        dateFilter,
        setDateFilter,
        timeFilter,
        setTimeFilter,
        timeWindowStart,
        setTimeWindowStart,
        timeWindowEnd,
        setTimeWindowEnd,
        subcategoryFilter,
        setSubcategoryFilter,
        searchQuery,
        setSearchQuery,
        resetSearchFilters,
        applySearchSuggestion,
        handleCategoryPick,
      }}
    >
      {children}
    </FiltersContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error("useFilters must be used within FiltersProvider");
  return ctx;
}

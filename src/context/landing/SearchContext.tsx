"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useSearch, type CitySlots } from "@/hooks/useSearch";
import { useFilters } from "./FiltersContext";
import { useCityContext } from "./CityContext";
import { resolveDistanceOrigin } from "@/lib/geo/resolveDistanceOrigin";
import {
  applyFallbackPolicy,
  resolveFallbackPolicy,
} from "@/lib/availability/fallbackPolicy";
import {
  rankSearchResults,
  type RankedSlot,
} from "@/lib/search/rankSearchResults";
import { bookingSlotId } from "@/lib/search/buildBookingDiscoveryGroups";
import type { FallbackInfo } from "@/lib/search/searchFallback";
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
  /** Batch 3 — centralised ranking. BookingWidget (and any future discovery
   * surface) reads these instead of running rankSearchResults locally. */
  rankedDiscovery: RankedSlot[];
  /** Slot ids that QuickAccess would pick if asked to rank the same pool —
   * used by downstream consumers to dedupe the discovery rows. */
  quickAccessPreviewIds: string[];
  /** Resolved fallback metadata from the discovery ranker. */
  discoveryFallback: FallbackInfo;
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

  // Centralised discovery ranking. Previously this lived inside BookingWidget
  // as a `ranked` useMemo, but that meant the rank pipeline (source pick →
  // policy filter → two rankSearchResults passes) ran inside a render that
  // also owned `discoveryBuild`. Moving it here ensures any future surface
  // (search page, AI recovery rows) sees the same shape without duplicating
  // logic, and BookingWidget stops re-deriving ranking on every interaction.
  const distanceLat = distanceOrigin?.lat;
  const distanceLng = distanceOrigin?.lng;
  const recoveryScenario = recoveryState?.recoveryScenario;
  const recoveryReason = recoveryState?.reason;
  const rankedView = useMemo(() => {
    const explicitIntent =
      searchQuery || subcategoryFilter
        ? "explicit_service"
        : category
          ? "explicit_city_service"
          : "discovery";
    const policy = resolveFallbackPolicy("bookingwidget", { kind: explicitIntent });
    const shouldTrustEffectiveCity =
      recoveryScenario === "exact_in_nearest_city" ||
      recoveryScenario === "related_in_nearest_city";
    const cityRecovery =
      recoveryReason === "no_city_salons" ||
      recoveryReason === "no_city_slots";
    const sourceSlots = cityRecovery
      ? discovery.length > 0
        ? discovery
        : results
      : results.length > 0
        ? results
        : discovery;
    const eligible =
      shouldTrustEffectiveCity || cityRecovery
        ? sourceSlots
        : applyFallbackPolicy(sourceSlots, policy);
    const userLocation =
      distanceLat != null && distanceLng != null
        ? { lat: distanceLat, lng: distanceLng }
        : undefined;

    const quickAccessPreview = rankSearchResults({
      slots: eligible,
      strategy: "quickaccess",
      userLocation,
      fallbackLevel,
    });
    const discoveryRanked = rankSearchResults({
      slots: eligible,
      strategy: "searchpage",
      limit: 50,
      userLocation,
      fallbackLevel,
    });

    return {
      rankedDiscovery: discoveryRanked.slots,
      quickAccessPreviewIds: quickAccessPreview.slots.map(bookingSlotId),
      discoveryFallback: discoveryRanked.fallback,
    };
  }, [
    results,
    discovery,
    distanceLat,
    distanceLng,
    fallbackLevel,
    recoveryScenario,
    recoveryReason,
    searchQuery,
    subcategoryFilter,
    category,
  ]);

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
        rankedDiscovery: rankedView.rankedDiscovery,
        quickAccessPreviewIds: rankedView.quickAccessPreviewIds,
        discoveryFallback: rankedView.discoveryFallback,
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

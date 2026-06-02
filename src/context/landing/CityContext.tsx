"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import {
  useCitySelector,
  type GpsLocationRequestResult,
} from "@/hooks/useCitySelector";
import {
  SERBIAN_CITIES,
  setCityCatalog,
  type DynamicCity,
  type SerbianCity,
} from "@/lib/cities";
import type {
  GeoSource,
  GeoSignals,
  ResolvedGeo,
} from "@/lib/geo/resolveGeoPriority";

interface CityContextValue {
  city: SerbianCity;
  cityName: string;
  setCity: (city: SerbianCity) => void;
  setCityByName: (name: string) => void;
  geoLoading: boolean;
  geoReady: boolean;
  requestGpsLocation: (options?: {
    updateCity?: boolean;
    promoteToExplicit?: boolean;
  }) => Promise<GpsLocationRequestResult>;
  /** Phase 2.5B — geo signals + resolved priority surfaced for consumers
   * that need richer geo info (preload, ranking, analytics). */
  geoSignals: GeoSignals;
  geoResolved: ResolvedGeo;
  geoSource: GeoSource;
  userLocation: { lat: number; lng: number; city?: string } | undefined;
  userLocationSource: "gps" | undefined;
  userLocationAccuracyMeters: number | undefined;
  isApproximateLocation: boolean;
}

const CityContext = createContext<CityContextValue | null>(null);

export function CityProvider({
  children,
  initialCity,
}: {
  children: ReactNode;
  initialCity?: string;
}) {
  const {
    city,
    setCity,
    geoLoading,
    geoReady,
    geoSource,
    userLocation,
    userLocationSource,
    userLocationAccuracyMeters,
    isApproximateLocation,
    requestGpsLocation,
    signals,
    resolved,
  } =
    useCitySelector(initialCity || undefined);

  // Hydrate the live city catalog from the platform marketplace once on mount.
  // Read-only consumers of SERBIAN_CITIES pick up the new list via live binding.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/cities")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: DynamicCity[] | null) => {
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          setCityCatalog(data);
        }
      })
      .catch(() => {/* soft-fail — static catalog stays in place */});
    return () => {
      cancelled = true;
    };
  }, []);

  const setCityByName = (name: string) => {
    const found = SERBIAN_CITIES.find(
      (c) => c.name.toLowerCase() === name.toLowerCase(),
    );
    if (found) setCity(found);
    else console.warn("[CityContext] city not found:", name);
  };

  return (
    <CityContext.Provider
      value={{
        city,
        cityName: city.name,
        setCity,
        setCityByName,
        geoLoading,
        geoReady,
        requestGpsLocation,
        geoSignals: signals,
        geoResolved: resolved,
        geoSource,
        userLocation,
        userLocationSource,
        userLocationAccuracyMeters,
        isApproximateLocation,
      }}
    >
      {children}
    </CityContext.Provider>
  );
}

export function useCityContext() {
  const ctx = useContext(CityContext);
  if (!ctx) throw new Error("useCityContext must be used within CityProvider");
  return ctx;
}

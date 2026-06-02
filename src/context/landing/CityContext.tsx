"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
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
  /** Live, marketplace-driven city list for UI (Header, Hero, QuickAccess).
   * Updates reactively once /api/cities resolves. */
  cities: SerbianCity[];
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

  // Reactive city list for the UI. Seeded from the current (static) catalog so
  // SSR/first paint has cities, then replaced by the live marketplace list.
  const [cities, setCities] = useState<SerbianCity[]>(SERBIAN_CITIES);

  // Hydrate the live city catalog from the platform marketplace once on mount.
  // - setCityCatalog updates the module live binding (pure fns, geo, validation)
  // - setCities updates React state so the Header/Hero/QuickAccess re-render
  useEffect(() => {
    let cancelled = false;
    fetch("/api/cities")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: DynamicCity[] | null) => {
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          setCityCatalog(data);
          setCities([...SERBIAN_CITIES]);
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
        cities,
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

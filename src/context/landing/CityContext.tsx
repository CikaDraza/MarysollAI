"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useCitySelector } from "@/hooks/useCitySelector";
import { SERBIAN_CITIES, type SerbianCity } from "@/lib/cities";

interface CityContextValue {
  city: SerbianCity;
  cityName: string;
  setCity: (city: SerbianCity) => void;
  setCityByName: (name: string) => void;
}

const CityContext = createContext<CityContextValue | null>(null);

export function CityProvider({
  children,
  initialCity,
}: {
  children: ReactNode;
  initialCity?: string;
}) {
  const { city, setCity } = useCitySelector(initialCity || undefined);

  const setCityByName = (name: string) => {
    const found = SERBIAN_CITIES.find(
      (c) => c.name.toLowerCase() === name.toLowerCase(),
    );
    if (found) setCity(found);
    else console.warn("[CityContext] city not found:", name);
  };

  return (
    <CityContext.Provider value={{ city, cityName: city.name, setCity, setCityByName }}>
      {children}
    </CityContext.Provider>
  );
}

export function useCityContext() {
  const ctx = useContext(CityContext);
  if (!ctx) throw new Error("useCityContext must be used within CityProvider");
  return ctx;
}

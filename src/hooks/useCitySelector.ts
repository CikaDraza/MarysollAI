"use client";
import { useState, useEffect } from "react";
import { SERBIAN_CITIES, nearestCity, findCity, type SerbianCity } from "@/lib/cities";

const STORAGE_KEY = "marysoll_city";

export function useCitySelector(initialCity?: string) {
  const [city, setCityState] = useState<SerbianCity>(SERBIAN_CITIES[0]);
  const [geoLoading, setGeoLoading] = useState(false);

  useEffect(() => {
    // 1. Stored preference wins — user already picked a city manually
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const found = findCity(stored);
      if (found) { setCityState(found); return; }
    }

    // 2. City from URL (initialCity prop)
    if (initialCity) {
      const found = findCity(initialCity);
      if (found) {
        setCityState(found);
        localStorage.setItem(STORAGE_KEY, found.name);
        return;
      }
    }

    // 3. Geolocation — first visit only (nothing stored)
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nearest = nearestCity(pos.coords.latitude, pos.coords.longitude);
        setCityState(nearest);
        localStorage.setItem(STORAGE_KEY, nearest.name);
        setGeoLoading(false);
      },
      () => setGeoLoading(false),
      { timeout: 5000 },
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setCity = (c: SerbianCity) => {
    setCityState(c);
    localStorage.setItem(STORAGE_KEY, c.name);
  };

  return { city, setCity, cities: SERBIAN_CITIES, geoLoading };
}

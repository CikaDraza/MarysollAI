// src/lib/geo/getCity.ts

const STORAGE_KEY = "marysoll_selected_city";
const FALLBACK_CITY = "Novi Sad";

export interface CityResult {
  city: string;
  lat?: number;
  lng?: number;
}

/**
 * Client-side: localStorage → browser geolocation → fallback.
 * Server-side: pass headers (x-vercel-ip-city) → fallback.
 */
export async function getCity(headers?: Record<string, string>): Promise<CityResult> {
  // Server-side: read Vercel geo header
  if (headers) {
    const city = headers["x-vercel-ip-city"];
    if (city) return { city: decodeURIComponent(city) };
    return { city: FALLBACK_CITY };
  }

  // Client-side priority 1: user-selected city
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as CityResult;
        if (parsed.city) return parsed;
      } catch {
        // malformed JSON — ignore
      }
    }
  }

  // Client-side priority 2: browser geolocation (best-effort)
  if (typeof window !== "undefined" && "geolocation" in navigator) {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 });
      });
      return {
        city: FALLBACK_CITY,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };
    } catch {
      // denied or timed out — fall through
    }
  }

  return { city: FALLBACK_CITY };
}

/** Persist user's city choice. */
export function saveCity(result: CityResult) {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  }
}

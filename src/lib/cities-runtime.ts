import "server-only";
import { platformClient } from "@/lib/api/platformClient";
import { setCityCatalog, type DynamicCity } from "@/lib/cities";

const TTL_MS = 2 * 60 * 1000; // 2 minutes

let cache: { at: number; cities: DynamicCity[] } | null = null;
let inFlight: Promise<DynamicCity[]> | null = null;

async function fetchCities(): Promise<DynamicCity[]> {
  const rows = await platformClient.getMarketplaceCities();
  return rows.map((r) => ({
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    popularityScore: r.popularityScore ?? 0,
  }));
}

/**
 * Ensures the live city catalog (lib/cities) is hydrated from the platform
 * marketplace. Safe to call on every server request — results are cached for
 * TTL_MS and concurrent calls share one fetch. Soft-fails to the static
 * catalog so search never breaks if the platform is unreachable.
 */
export async function ensureCityCatalog(): Promise<DynamicCity[]> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) {
    setCityCatalog(cache.cities);
    return cache.cities;
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const cities = await fetchCities();
      if (cities.length > 0) {
        cache = { at: Date.now(), cities };
        setCityCatalog(cities);
      }
      return cities;
    } catch (err) {
      console.error("[ensureCityCatalog] failed, using static fallback:", err);
      return cache?.cities ?? [];
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Forces the next ensureCityCatalog() call to re-fetch (cache-bust). */
export function invalidateCityCatalog(): void {
  cache = null;
}

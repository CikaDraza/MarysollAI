export interface SerbianCity {
  name: string;
  lat: number;
  lng: number;
}

/**
 * Static fallback catalog. Used at build time, in tests, and whenever the
 * dynamic catalog (from the platform marketplace) has not been hydrated yet.
 * Coordinates here also backfill new cities whose lat/lng the platform has not
 * stored, when the name matches.
 */
export const STATIC_SERBIAN_CITIES: SerbianCity[] = [
  { name: "Beograd",            lat: 44.8176, lng: 20.4569 },
  { name: "Novi Sad",           lat: 45.2671, lng: 19.8335 },
  { name: "Niš",                lat: 43.3209, lng: 21.8954 },
  { name: "Kragujevac",         lat: 44.0142, lng: 20.9394 },
  { name: "Subotica",           lat: 46.1003, lng: 19.6658 },
  { name: "Zrenjanin",          lat: 45.3817, lng: 20.3839 },
  { name: "Pančevo",            lat: 44.8708, lng: 20.6403 },
  { name: "Čačak",              lat: 43.8914, lng: 20.3497 },
  { name: "Kraljevo",           lat: 43.7234, lng: 20.6892 },
  { name: "Kruševac",           lat: 43.5806, lng: 21.3344 },
  { name: "Smederevo",          lat: 44.6633, lng: 20.9289 },
  { name: "Leskovac",           lat: 42.9981, lng: 21.9461 },
  { name: "Valjevo",            lat: 44.2708, lng: 19.8908 },
  { name: "Užice",              lat: 43.8556, lng: 19.8425 },
  { name: "Šabac",              lat: 44.7489, lng: 19.6900 },
  { name: "Sombor",             lat: 45.7742, lng: 19.1122 },
  { name: "Požarevac",          lat: 44.6219, lng: 21.1881 },
  { name: "Pirot",              lat: 43.1531, lng: 22.5861 },
  { name: "Zaječar",            lat: 43.9039, lng: 22.2647 },
  { name: "Vranje",             lat: 42.5514, lng: 21.8978 },
  { name: "Sremska Mitrovica",  lat: 44.9744, lng: 19.6122 },
  { name: "Loznica",            lat: 44.5333, lng: 19.2167 },
  { name: "Novi Pazar",         lat: 43.1367, lng: 20.5172 },
  { name: "Bor",                lat: 44.0869, lng: 22.0986 },
  { name: "Vršac",              lat: 45.1219, lng: 21.2967 },
  { name: "Kikinda",            lat: 45.8294, lng: 20.4650 },
  { name: "Jagodina",           lat: 43.9772, lng: 21.2611 },
  { name: "Prokuplje",          lat: 43.2342, lng: 21.5889 },
  { name: "Vrbas",              lat: 45.5703, lng: 19.6428 },
];

const STATIC_CITY_POPULARITY: Record<string, number> = {
  "Beograd": 10,
  "Novi Sad": 9,
  "Niš": 9,
  "Subotica": 8,
  "Zrenjanin": 7,
  "Kraljevo": 7,
  "Sremska Mitrovica": 6,
  "Bor": 6,
  "Loznica": 6,
};

/**
 * Live city catalog. This is an `export let` so it is a *live binding*: when
 * `setCityCatalog` reassigns it, every module that imported `SERBIAN_CITIES`
 * sees the new value without any code change at the call site.
 */
export let SERBIAN_CITIES: SerbianCity[] = [...STATIC_SERBIAN_CITIES];

/** Live popularity map, kept in sync with the catalog. */
export let CITY_POPULARITY: Record<string, number> = { ...STATIC_CITY_POPULARITY };

/** True once the dynamic catalog has replaced the static one at least once. */
export let cityCatalogHydrated = false;

export interface DynamicCity {
  name: string;
  lat: number | null;
  lng: number | null;
  popularityScore: number;
}

function staticCoordsFor(name: string): SerbianCity | undefined {
  const lower = name.toLowerCase().trim();
  return STATIC_SERBIAN_CITIES.find((c) => c.name.toLowerCase() === lower);
}

/**
 * Replaces the live catalog with the dynamic city list from the platform.
 * Cities missing coordinates fall back to static coords (by name) so geo
 * ranking keeps working; cities with neither are dropped from the coordinate
 * catalog but still contribute to popularity.
 */
export function setCityCatalog(cities: DynamicCity[]): void {
  if (!Array.isArray(cities) || cities.length === 0) return;

  const nextCatalog: SerbianCity[] = [];
  const nextPopularity: Record<string, number> = {};

  for (const c of cities) {
    const name = c.name?.trim();
    if (!name) continue;
    nextPopularity[name] = c.popularityScore ?? 0;

    const lat = typeof c.lat === "number" ? c.lat : staticCoordsFor(name)?.lat;
    const lng = typeof c.lng === "number" ? c.lng : staticCoordsFor(name)?.lng;
    if (typeof lat === "number" && typeof lng === "number") {
      nextCatalog.push({ name, lat, lng });
    }
  }

  if (nextCatalog.length > 0) SERBIAN_CITIES = nextCatalog;
  CITY_POPULARITY = nextPopularity;
  cityCatalogHydrated = true;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearestCity(lat: number, lng: number): SerbianCity {
  return SERBIAN_CITIES.reduce((best, c) => {
    return haversineKm(lat, lng, c.lat, c.lng) < haversineKm(lat, lng, best.lat, best.lng)
      ? c
      : best;
  });
}

export function findCity(name: string): SerbianCity | undefined {
  const lower = name.toLowerCase().trim();
  return SERBIAN_CITIES.find((c) => c.name.toLowerCase() === lower);
}

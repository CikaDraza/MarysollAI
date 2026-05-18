import { findCity, nearestCity, SERBIAN_CITIES } from "@/lib/cities";
import {
  resolveGeoPriority,
  type GeoSignals,
  type ResolvedGeo,
} from "@/lib/geo/resolveGeoPriority";

export const GEO_RESOLUTION_TIMEOUT_MS = 1200;
export const TRENDING_CITY = "Beograd";

export type GeoResolutionStatus = "pending" | "success" | "failed";

export interface GpsResolutionInput {
  status: GeoResolutionStatus;
  lat?: number;
  lng?: number;
  accuracyMeters?: number;
}

export interface IpResolutionInput {
  status: GeoResolutionStatus;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface ResolveInitialGeoStateInput {
  storedCity?: string | null;
  initialCity?: string | null;
  ipResult?: IpResolutionInput;
  gpsResult?: GpsResolutionInput;
  manualSelection?: string | null;
  timeoutExpired?: boolean;
}

export interface ResolvedInitialGeoState {
  signals: GeoSignals;
  resolved: ResolvedGeo;
  geoReady: boolean;
  cityToApply?: string;
}

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeCityName(city?: string | null): string | undefined {
  if (!city) return undefined;
  return findCity(city)?.name;
}

function signalForCity(city?: string | null) {
  const found = normalizeCityName(city);
  if (!found) return undefined;
  const known = findCity(found);
  return known ? { city: known.name, lat: known.lat, lng: known.lng } : undefined;
}

export function buildGeoSignals(
  input: ResolveInitialGeoStateInput,
): GeoSignals {
  const signals: GeoSignals = {};

  const explicitCity = input.manualSelection ?? input.initialCity;
  const explicit = signalForCity(explicitCity);
  if (explicit) {
    signals.explicit = explicit;
  } else {
    const saved = normalizeCityName(input.storedCity);
    if (saved) signals.saved = { city: saved };
  }

  if (
    input.gpsResult?.status === "success" &&
    validNumber(input.gpsResult.lat) &&
    validNumber(input.gpsResult.lng)
  ) {
    const city = nearestCity(input.gpsResult.lat, input.gpsResult.lng).name;
    signals.gps = {
      lat: input.gpsResult.lat,
      lng: input.gpsResult.lng,
      city,
      accuracyMeters: input.gpsResult.accuracyMeters,
    };
  }

  if (input.ipResult?.status === "success") {
    const lat = input.ipResult.lat;
    const lng = input.ipResult.lng;
    const hasCoords = validNumber(lat) && validNumber(lng);
    const city = hasCoords
      ? nearestCity(lat, lng).name
      : normalizeCityName(input.ipResult.city);

    if (city || hasCoords) {
      signals.ip = {
        city: city ?? input.ipResult.city ?? "",
        lat: hasCoords ? lat : undefined,
        lng: hasCoords ? lng : undefined,
      };
    }
  }

  const hasAnyResolvedSignal =
    signals.explicit || signals.gps || signals.saved || signals.ip;
  if (input.timeoutExpired && !hasAnyResolvedSignal) {
    signals.trending = { city: TRENDING_CITY };
  }

  return signals;
}

export function resolveInitialGeoState(
  input: ResolveInitialGeoStateInput,
): ResolvedInitialGeoState {
  const signals = buildGeoSignals(input);
  const resolved = resolveGeoPriority(signals);

  const explicitReady = Boolean(signals.explicit);
  const gpsDone =
    input.gpsResult?.status === "success" ||
    input.gpsResult?.status === "failed";
  const ipDone =
    input.ipResult?.status === "success" || input.ipResult?.status === "failed";

  const geoReady =
    explicitReady ||
    Boolean(signals.gps) ||
    Boolean(input.timeoutExpired) ||
    Boolean(signals.saved && gpsDone) ||
    Boolean(signals.ip && gpsDone) ||
    Boolean(gpsDone && ipDone);

  const cityToApply = resolved.city
    ? normalizeCityName(resolved.city) ?? resolved.city
    : undefined;

  return {
    signals,
    resolved,
    geoReady,
    cityToApply,
  };
}

export function trendingCity() {
  return findCity(TRENDING_CITY) ?? SERBIAN_CITIES[0];
}

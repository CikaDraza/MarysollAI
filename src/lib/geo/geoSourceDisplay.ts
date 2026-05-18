import { findCity, nearestCity } from "@/lib/cities";
import type {
  GeoSignals,
  GeoSource,
  ResolvedGeo,
} from "@/lib/geo/resolveGeoPriority";
import type { DistanceOrigin } from "@/lib/geo/resolveDistanceOrigin";

interface GeoSourceDisplayInput {
  resolved: ResolvedGeo;
  signals: GeoSignals;
}

interface GeoSourceDisplay {
  label: string;
  city?: string;
  text: string;
}

interface UserLocationDisplayInput {
  origin?: DistanceOrigin;
}

export function isApproximateLocation(origin?: DistanceOrigin): boolean {
  if (!origin) return false;
  return (
    origin.source === "gps" &&
    typeof origin.accuracyMeters === "number" &&
    origin.accuracyMeters > 10000
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function cityFromSignal(signal?: { city?: string; lat?: number; lng?: number }) {
  if (!signal) return undefined;
  if (signal.city) return findCity(signal.city)?.name ?? signal.city;
  if (isFiniteNumber(signal.lat) && isFiniteNumber(signal.lng)) {
    return nearestCity(signal.lat, signal.lng).name;
  }
  return undefined;
}

function sourceLabel(source: GeoSource) {
  switch (source) {
    case "gps":
      return "GPS";
    case "ip":
      return "IP";
    case "saved":
      return "sačuvana prethodna lokacija";
    case "trending":
      return "u trendu";
    case "explicit":
      return "izabrana lokacija";
  }
}

export function resolveGeoSourceDisplay({
  resolved,
  signals,
}: GeoSourceDisplayInput): GeoSourceDisplay {
  const source = resolved.source;
  const label = sourceLabel(source);
  const signal = signals[source];
  const city =
    source === "trending"
      ? undefined
      : cityFromSignal(signal) ?? cityFromSignal(resolved);

  return {
    label,
    city,
    text: city ? `${label} - ${city}` : label,
  };
}

export function resolveUserLocationDisplay({
  origin,
}: UserLocationDisplayInput): string {
  if (!origin || origin.source === "city") return "vaša lokacija - nema podataka";

  const city = cityFromSignal(origin);
  const approximate = isApproximateLocation(origin);
  const prefix = approximate ? "približna lokacija" : "GPS lokacija";

  return city ? `${prefix} - ${city}` : prefix;
}

export function resolveSearchLocationLabel(resolved: ResolvedGeo): string {
  const city = resolved.city ? findCity(resolved.city)?.name ?? resolved.city : "";
  return city ? `Tražimo za: ${city}` : "Tražimo za: trenutno odabranu lokaciju";
}

export function resolveDistanceLocationLabel(origin?: DistanceOrigin): string {
  if (!origin) {
    return "Udaljenost računamo od: nema podataka";
  }

  if (origin.source === "city") {
    return origin.city
      ? `Udaljenost računamo od izabrane lokacije: ${origin.city}`
      : "Udaljenost računamo od izabrane lokacije";
  }

  const city = cityFromSignal(origin);
  const prefix = isApproximateLocation(origin)
    ? "Udaljenost računamo od približne lokacije"
    : "Udaljenost računamo od GPS lokacije";

  return city ? `${prefix}: ${city}` : prefix;
}

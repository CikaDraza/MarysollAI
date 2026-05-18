// src/lib/geo/resolveGeoPriority.ts
//
// Centralized geo priority resolver.
//
// Priority chain (HIGHER WINS):
//   1. explicit          — user picked a city in the UI                  (manual)
//   2. gps (high-accuracy) — browser geolocation accuracy ≤ 1 km          (precise)
//   3. saved             — localStorage city from previous session        (warm)
//   4. trending          — fallback to a popular city                     (last resort)
//
// GPS gating: a GPS signal whose accuracy is worse than
// HIGH_ACCURACY_GPS_THRESHOLD_METERS does NOT change the city — it stays
// useful for distance sorting through resolveDistanceOrigin (≤ 10 km), but
// the user keeps their saved city until a precise fix arrives. This prevents
// Wi-Fi triangulation pseudo-fixes from teleporting the user.
//
// CRITICAL RULE: explicit ALWAYS wins. Never override a manually selected
// city with a geo guess — that would be a UX trust violation.
//
// The resolver is data-only. It does NOT trigger geolocation prompts or
// network requests — caller passes pre-fetched signals.

import { isHighAccuracyGps } from "./resolveDistanceOrigin";

export type GeoSource = "explicit" | "gps" | "saved" | "trending";

export interface GeoSignal {
  source: GeoSource;
  /** City display name (Serbian-language, properly capitalized). */
  city?: string;
  /** Latitude (precise: gps; null: city only). */
  lat?: number;
  /** Longitude (precise: gps; null: city only). */
  lng?: number;
}

export interface GeoSignals {
  /** User picked a city in the UI dropdown / clicked a city tile. */
  explicit?: { city: string; lat?: number; lng?: number };
  /** Browser geolocation result (already permission-granted by caller). */
  gps?: { lat: number; lng: number; city?: string; accuracyMeters?: number };
  /** localStorage saved city from previous session. */
  saved?: { city: string };
  /** Trending city — final fallback when nothing else is known. */
  trending?: { city: string };
}

export interface ResolvedGeo extends GeoSignal {
  /** All signals that were available, in priority order. Useful for debug
   * + analytics — we can see what we *could* have used. */
  available: GeoSource[];
}

/**
 * Resolve the highest-priority geo signal. Returns `{ source: "trending" }`
 * with no coordinates when nothing is available — caller decides whether to
 * show city UI or render a "where are you?" prompt.
 *
 * IMPORTANT — explicit always wins. Never returns gps/saved/ip when the user
 * has explicitly picked a city in this session.
 */
export function resolveGeoPriority(signals: GeoSignals): ResolvedGeo {
  const gpsHighAccuracy = isHighAccuracyGps(signals.gps);
  const available: GeoSource[] = [];
  if (signals.explicit) available.push("explicit");
  if (signals.gps && gpsHighAccuracy) available.push("gps");
  if (signals.saved) available.push("saved");
  if (signals.trending) available.push("trending");

  // 1. Explicit user choice — never overridden.
  if (signals.explicit) {
    return {
      source: "explicit",
      city: signals.explicit.city,
      lat: signals.explicit.lat,
      lng: signals.explicit.lng,
      available,
    };
  }

  // 2. GPS — only when accuracy meets the high-precision threshold. Low-
  //    accuracy fixes are kept for distance sorting elsewhere, but they
  //    must not move the user across city boundaries.
  if (signals.gps && gpsHighAccuracy) {
    return {
      source: "gps",
      city: signals.gps.city,
      lat: signals.gps.lat,
      lng: signals.gps.lng,
      available,
    };
  }

  // 3. Saved city from previous session — warms the page while we wait for
  //    a precise GPS fix (or instead of one, if GPS is denied / inaccurate).
  if (signals.saved) {
    return {
      source: "saved",
      city: signals.saved.city,
      available,
    };
  }

  // 4. Trending fallback — best-effort guess.
  if (signals.trending) {
    return {
      source: "trending",
      city: signals.trending.city,
      available,
    };
  }

  return { source: "trending", available };
}

/**
 * Convenience: returns true when the resolved geo is the user's explicit
 * choice. Components should use this before suggesting an alternative city —
 * if the user explicitly picked it, don't second-guess them.
 */
export function isExplicitChoice(resolved: ResolvedGeo): boolean {
  return resolved.source === "explicit";
}

/**
 * Convenience: confidence score [0, 1] used by ranking when distance is
 * involved. GPS is high confidence; trending is low. Distance signals from
 * lower-confidence sources can be discounted by the caller if needed.
 */
export function geoConfidence(source: GeoSource): number {
  switch (source) {
    case "gps":
      return 1;
    case "explicit":
      return 0.9; // city-level only, but trustworthy
    case "saved":
      return 0.7;
    case "trending":
      return 0.1;
  }
}

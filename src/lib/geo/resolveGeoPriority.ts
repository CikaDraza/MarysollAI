// src/lib/geo/resolveGeoPriority.ts
//
// Phase 2.5A+ Task 18 — Centralized geo priority resolver.
//
// Priority chain (HIGHER WINS):
//   1. explicit  — user picked a city in the UI                  (manual)
//   2. gps       — browser geolocation API                        (precise)
//   3. saved     — localStorage city from previous session        (warm)
//   4. ip        — server-side IP city lookup                     (cold)
//   5. trending  — fallback to a popular city in the platform     (last resort)
//
// CRITICAL RULE: explicit ALWAYS wins. Never override a manually selected
// city with a geo guess — that would be a UX trust violation. The resolver
// returns the highest-priority source available; downstream code never has
// to reason about "should I use the GPS or the saved city".
//
// The resolver is data-only. It does NOT trigger geolocation prompts or
// network requests — caller passes pre-fetched signals. This keeps the
// function pure + testable.

export type GeoSource = "explicit" | "gps" | "saved" | "ip" | "trending";

export interface GeoSignal {
  source: GeoSource;
  /** City display name (Serbian-language, properly capitalized). */
  city?: string;
  /** Latitude (precise: gps; approximate: ip; null: city only). */
  lat?: number;
  /** Longitude (precise: gps; approximate: ip; null: city only). */
  lng?: number;
}

export interface GeoSignals {
  /** User picked a city in the UI dropdown / clicked a city tile. */
  explicit?: { city: string; lat?: number; lng?: number };
  /** Browser geolocation result (already permission-granted by caller). */
  gps?: { lat: number; lng: number; city?: string; accuracyMeters?: number };
  /** localStorage saved city from previous session. */
  saved?: { city: string };
  /** Server-side IP-based city lookup. */
  ip?: { city: string; lat?: number; lng?: number };
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
  const available: GeoSource[] = [];
  if (signals.explicit) available.push("explicit");
  if (signals.gps) available.push("gps");
  if (signals.saved) available.push("saved");
  if (signals.ip) available.push("ip");
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

  // 2. GPS — precise coordinates, optional reverse-geocoded city.
  if (signals.gps) {
    return {
      source: "gps",
      city: signals.gps.city,
      lat: signals.gps.lat,
      lng: signals.gps.lng,
      available,
    };
  }

  // 3. Saved city from previous session.
  if (signals.saved) {
    return {
      source: "saved",
      city: signals.saved.city,
      available,
    };
  }

  // 4. IP-based fallback.
  if (signals.ip) {
    return {
      source: "ip",
      city: signals.ip.city,
      lat: signals.ip.lat,
      lng: signals.ip.lng,
      available,
    };
  }

  // 5. Trending fallback — best-effort guess.
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
    case "ip":
      return 0.5;
    case "trending":
      return 0.1;
  }
}

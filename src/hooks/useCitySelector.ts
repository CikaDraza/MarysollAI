"use client";
//
// Phase 2.5B Tasks 1–3, 13 — Geo single-source-of-truth migration.
//
// Previously: useCitySelector contained inline priority logic
// (localStorage > URL > GPS). Now it collects signals and delegates the
// decision to `resolveGeoPriority`. CityContext becomes a signal collector,
// not a decision engine — the resolver owns priority everywhere.
//
// Behavior preservation:
//   Old order: localStorage > URL > GPS
//   New order via resolver: explicit > gps > saved > ip > trending
//
// We map the legacy signals into the resolver's slots:
//   - localStorage stored value  → `explicit` (it was a previous user choice)
//   - URL initialCity prop       → `explicit` (set only if no localStorage)
//   - navigator.geolocation      → `gps`
//
// Result: explicit always wins, GPS fills in when nothing was previously
// chosen. Identical user-visible behavior, but priority is now centralized.
//
// SSR safety:
//   - All `window` / `localStorage` / `navigator` reads gated by typeof checks
//   - First render returns SERBIAN_CITIES[0] (Beograd) — same as before
//   - Hydration mismatch avoided: the "real" city only populates after the
//     mount-effect runs, never during SSR.
import { useState, useEffect, useRef, useMemo } from "react";
import {
  SERBIAN_CITIES,
  nearestCity,
  findCity,
  type SerbianCity,
} from "@/lib/cities";
import {
  resolveGeoPriority,
  type GeoSignals,
  type ResolvedGeo,
} from "@/lib/geo/resolveGeoPriority";
import { aiLog } from "@/lib/ai/debug-log";
import { trackSearchEvent } from "@/lib/search/searchAnalytics";

const STORAGE_KEY = "marysoll_city";
const log = aiLog("SEARCH_ENGINE");

export interface UseCitySelectorReturn {
  city: SerbianCity;
  setCity: (c: SerbianCity) => void;
  cities: SerbianCity[];
  geoLoading: boolean;
  /** Raw geo signals — exposed so consumers (preload, ranking) can read them. */
  signals: GeoSignals;
  /** Resolved geo from priority chain. Always reflects current signals. */
  resolved: ResolvedGeo;
}

export function useCitySelector(initialCity?: string): UseCitySelectorReturn {
  const [city, setCityState] = useState<SerbianCity>(SERBIAN_CITIES[0]);
  const [signals, setSignals] = useState<GeoSignals>({});
  const [geoLoading, setGeoLoading] = useState(false);
  /** Track whether the user explicitly chose during this session — once true,
   * GPS results never override. */
  const sessionExplicit = useRef(false);

  // Build initial signals on mount. SSR-safe: nothing reads window during
  // the synchronous render path; everything happens inside useEffect.
  useEffect(() => {
    const collected: GeoSignals = {};

    // localStorage stored value — treated as explicit (was a prior user choice).
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const found = findCity(stored);
          if (found) {
            collected.explicit = {
              city: found.name,
              lat: found.lat,
              lng: found.lng,
            };
          }
        }
      } catch {
        // Privacy mode / disabled storage — silently skip.
      }
    }

    // URL prop — only used when nothing was stored. Marks as explicit since
    // navigation to /grad/<city> is an explicit user intent.
    if (!collected.explicit && initialCity) {
      const found = findCity(initialCity);
      if (found) {
        collected.explicit = {
          city: found.name,
          lat: found.lat,
          lng: found.lng,
        };
        // Persist so the next visit warm-starts from this choice.
        try {
          if (typeof window !== "undefined") {
            window.localStorage.setItem(STORAGE_KEY, found.name);
          }
        } catch {
          /* ignore */
        }
      }
    }

    setSignals(collected);

    // Apply the resolved city right away if we have an explicit signal.
    const resolvedNow = resolveGeoPriority(collected);
    if (resolvedNow.city) {
      const found = findCity(resolvedNow.city);
      if (found) {
        setCityState(found);
        log("geo.resolved", { source: resolvedNow.source, city: found.name });
      }
    }

    // IP-based city — runs in parallel with GPS. Low priority signal:
    // resolveGeoPriority ranks `ip` below `explicit`, `gps`, `saved`. We
    // surface it so when GPS is denied/blocked, the user still gets a
    // reasonable default instead of falling all the way to "trending".
    if (!collected.explicit && typeof window !== "undefined") {
      void fetch("/api/geo/ip")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data || sessionExplicit.current) return;
          if (!data.city && data.lat == null) return;
          setSignals((prev) => ({
            ...prev,
            ip: {
              city: data.city ?? prev.ip?.city ?? "",
              lat: data.lat ?? undefined,
              lng: data.lng ?? undefined,
            },
          }));
          // Only apply ip-derived city if nothing better was resolved.
          // (GPS may still be in-flight; if it arrives later it overrides
          // via its own setSignals call above.)
          if (data.city && !sessionExplicit.current) {
            const found = findCity(data.city);
            // Don't override an explicit/gps/saved city that already populated.
            if (found && city.name === SERBIAN_CITIES[0].name) {
              setCityState(found);
              log("geo.ip_resolved", { city: found.name });
            }
          }
        })
        .catch(() => {
          /* soft-fail per spec */
        });
    }

    // GPS — only request when no explicit prior choice. Adds `gps` signal
    // when it succeeds; explicit always still wins thanks to the resolver.
    if (
      !collected.explicit &&
      typeof navigator !== "undefined" &&
      navigator.geolocation
    ) {
      setGeoLoading(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const nearest = nearestCity(pos.coords.latitude, pos.coords.longitude);
          // Critical: do NOT override an explicit choice the user made
          // between mount and GPS callback (race condition).
          if (sessionExplicit.current) {
            setGeoLoading(false);
            return;
          }
          setSignals((prev) => ({
            ...prev,
            gps: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              city: nearest.name,
            },
          }));
          setCityState(nearest);
          try {
            window.localStorage.setItem(STORAGE_KEY, nearest.name);
          } catch {
            /* ignore */
          }
          log("geo.gps_resolved", { city: nearest.name });
          setGeoLoading(false);
        },
        () => setGeoLoading(false),
        { timeout: 5000 },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manual selection — flips the session-explicit flag so subsequent GPS
  // resolves can't override.
  const setCity = (c: SerbianCity) => {
    const previousCityName = city.name;
    sessionExplicit.current = true;
    setCityState(c);
    setSignals((prev) => ({
      ...prev,
      explicit: { city: c.name, lat: c.lat, lng: c.lng },
    }));
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, c.name);
      }
    } catch {
      /* ignore */
    }
    log("geo.explicit_set", { city: c.name });
    if (previousCityName !== c.name) {
      trackSearchEvent({
        type: "search.city_change",
        city: c.name,
        from: previousCityName,
        via: "explicit",
      });
    }
  };

  // Always-fresh resolved geo — recomputes whenever signals change.
  const resolved = useMemo(() => resolveGeoPriority(signals), [signals]);

  return {
    city,
    setCity,
    cities: SERBIAN_CITIES,
    geoLoading,
    signals,
    resolved,
  };
}

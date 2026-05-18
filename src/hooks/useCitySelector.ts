"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
import {
  GEO_RESOLUTION_TIMEOUT_MS,
  TRENDING_CITY,
} from "@/lib/geo/resolveInitialGeoState";
import { resolveUserLocationOrigin } from "@/lib/geo/resolveDistanceOrigin";
import { aiLog } from "@/lib/ai/debug-log";
import { trackSearchEvent } from "@/lib/search/searchAnalytics";

const STORAGE_KEY = "marysoll_city";
const BACKGROUND_GPS_TIMEOUT_MS = 10000;
const APPROXIMATE_GPS_THRESHOLD_METERS = 10000;
const log = aiLog("SEARCH_ENGINE");
const isDev = process.env.NODE_ENV !== "production";

function geoLog(event: string, payload?: unknown) {
  if (!isDev) return;
  console.debug("[GEO]", event, payload ?? {});
}

export interface UseCitySelectorReturn {
  city: SerbianCity;
  setCity: (c: SerbianCity) => void;
  cities: SerbianCity[];
  geoLoading: boolean;
  requestGpsLocation: (options?: {
    updateCity?: boolean;
    promoteToExplicit?: boolean;
  }) => Promise<GpsLocationRequestResult>;
  /** Raw geo signals — exposed so consumers (preload, ranking) can read them. */
  signals: GeoSignals;
  /** Resolved geo from priority chain. Always reflects current signals. */
  resolved: ResolvedGeo;
  geoReady: boolean;
  geoSource: ResolvedGeo["source"];
  userLocation: { lat: number; lng: number; city?: string } | undefined;
  userLocationSource: "gps" | undefined;
  userLocationAccuracyMeters: number | undefined;
  isApproximateLocation: boolean;
}

export type GpsLocationRequestResult =
  | {
      ok: true;
      city: SerbianCity;
      accuracyMeters?: number;
      isApproximate: boolean;
    }
  | { ok: false; reason: "unavailable" | "denied" | "failed" };

export function useCitySelector(initialCity?: string): UseCitySelectorReturn {
  const [city, setCityState] = useState<SerbianCity>(SERBIAN_CITIES[0]);
  const [signals, setSignals] = useState<GeoSignals>({});
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoReady, setGeoReady] = useState(false);
  const gpsDone = useRef(false);
  const timeoutExpired = useRef(false);
  /** Track whether the user explicitly chose during this session — once true,
   * background GPS results never override cityState. */
  const sessionExplicit = useRef(false);

  const markGeoReady = useCallback((reason: string) => {
    setGeoReady((prev) => {
      if (!prev) geoLog("geoReady changes", { ready: true, reason });
      return true;
    });
  }, []);

  const maybeMarkReady = useCallback(
    (nextSignals: GeoSignals, reason: string) => {
      if (nextSignals.explicit) {
        markGeoReady(reason);
        return;
      }
      if (nextSignals.gps) {
        markGeoReady(reason);
        return;
      }
      if (nextSignals.saved && gpsDone.current) {
        markGeoReady(reason);
        return;
      }
      if (gpsDone.current) {
        markGeoReady(reason);
      }
    },
    [markGeoReady],
  );

  const applyResolvedCity = useCallback((nextSignals: GeoSignals, reason: string) => {
    const nextResolved = resolveGeoPriority(nextSignals);
    if (!nextResolved.city) return;
    const found = findCity(nextResolved.city);
    if (!found) return;
    setCityState(found);
    geoLog("applied city", {
      city: found.name,
      source: nextResolved.source,
      reason,
    });
  }, []);

  const updateSignals = useCallback(
    (updater: (prev: GeoSignals) => GeoSignals, reason: string) => {
      setSignals((prev) => {
        const next = updater(prev);
        applyResolvedCity(next, reason);
        maybeMarkReady(next, reason);
        return next;
      });
    },
    [applyResolvedCity, maybeMarkReady],
  );

  const requestGpsLocation = useCallback(
    (options?: { updateCity?: boolean; promoteToExplicit?: boolean }) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        gpsDone.current = true;
        updateSignals((prev) => prev, "gps-unavailable");
        const result: GpsLocationRequestResult = {
          ok: false,
          reason: "unavailable",
        };
        return Promise.resolve(result);
      }

      const updateCity = options?.updateCity === true;
      const promoteToExplicit = options?.promoteToExplicit === true;
      setGeoLoading(true);
      return new Promise<GpsLocationRequestResult>((resolve) => {
        navigator.geolocation.getCurrentPosition(
        (pos) => {
          gpsDone.current = true;
          const nearest = nearestCity(pos.coords.latitude, pos.coords.longitude);
          const accuracyMeters = Number.isFinite(pos.coords.accuracy)
            ? pos.coords.accuracy
            : undefined;
          const gpsSignal = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            city: nearest.name,
            accuracyMeters,
          };

          updateSignals(
            (prev) => ({
              ...prev,
              gps: gpsSignal,
              ...(promoteToExplicit
                ? {
                    explicit: {
                      city: nearest.name,
                      lat: nearest.lat,
                      lng: nearest.lng,
                    },
                  }
                : {}),
            }),
            "gps-success",
          );

          if (promoteToExplicit) {
            sessionExplicit.current = true;
            setCityState(nearest);
            markGeoReady("gps-promoted-explicit");
          }

          if ((updateCity && !sessionExplicit.current) || promoteToExplicit) {
            try {
              window.localStorage.setItem(STORAGE_KEY, nearest.name);
            } catch {
              /* ignore */
            }
            log("geo.gps_resolved", { city: nearest.name });
          } else if (sessionExplicit.current) {
            geoLog("late GPS ignored", { city: nearest.name });
          } else {
            log("geo.gps_signal", { city: nearest.name });
          }

          setGeoLoading(false);
          resolve({
            ok: true,
            city: nearest,
            accuracyMeters,
            isApproximate:
              typeof accuracyMeters === "number" &&
              accuracyMeters > APPROXIMATE_GPS_THRESHOLD_METERS,
          });
        },
        (error) => {
          gpsDone.current = true;
          setGeoLoading(false);
          updateSignals((prev) => prev, "gps-failed");
          resolve({
            ok: false,
            reason: error.code === error.PERMISSION_DENIED ? "denied" : "failed",
          });
        },
        { timeout: BACKGROUND_GPS_TIMEOUT_MS },
        );
      });
    },
    [markGeoReady, updateSignals],
  );

  // Build initial signals on mount. SSR-safe: nothing reads window during
  // the synchronous render path; everything happens inside useEffect.
  useEffect(() => {
    const collected: GeoSignals = {};

    // URL prop marks an explicit current-session intent.
    if (initialCity) {
      const found = findCity(initialCity);
      if (found) {
        collected.explicit = {
          city: found.name,
          lat: found.lat,
          lng: found.lng,
        };
        sessionExplicit.current = true;
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

    // localStorage is a saved signal from a previous session, not explicit.
    if (!collected.explicit && typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const found = findCity(stored);
          if (found) {
            collected.saved = { city: found.name };
          }
        }
      } catch {
        // Privacy mode / disabled storage — silently skip.
      }
    }

    geoLog("initial signals", collected);
    setSignals(collected);

    const resolvedNow = resolveGeoPriority(collected);
    if (resolvedNow.city) {
      const found = findCity(resolvedNow.city);
      if (found) {
        setCityState(found);
        log("geo.resolved", { source: resolvedNow.source, city: found.name });
        geoLog("applied city", {
          city: found.name,
          source: resolvedNow.source,
          reason: "initial",
        });
      }
    }
    if (collected.explicit) markGeoReady("explicit-initial");

    // Background GPS is the only live user-location signal. It may update
    // distance/search coordinates later, but explicit city still owns display.
    requestGpsLocation({ updateCity: !collected.explicit });

    const timeout = window.setTimeout(() => {
      timeoutExpired.current = true;
      updateSignals((prev) => {
        const resolved = resolveGeoPriority(prev);
        if (resolved.city) return prev;
        geoLog("timeout fallback used", { city: TRENDING_CITY });
        return {
          ...prev,
          trending: { city: TRENDING_CITY },
        };
      }, "timeout");
      markGeoReady("timeout");
    }, GEO_RESOLUTION_TIMEOUT_MS);

    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manual selection — flips the session-explicit flag so subsequent GPS
  // resolves can't override.
  const setCity = (c: SerbianCity) => {
    const previousCityName = city.name;
    sessionExplicit.current = true;
    setCityState(c);
    updateSignals(
      (prev) => ({
        ...prev,
        explicit: { city: c.name, lat: c.lat, lng: c.lng },
      }),
      "manual-explicit",
    );
    markGeoReady("manual-explicit");
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
  const userLocationOrigin = useMemo(
    () => resolveUserLocationOrigin(signals),
    [signals],
  );
  const userLocationAccuracyMeters = userLocationOrigin?.accuracyMeters;
  const isApproximateLocation =
    userLocationOrigin?.source === "gps" &&
    typeof userLocationAccuracyMeters === "number" &&
    userLocationAccuracyMeters > APPROXIMATE_GPS_THRESHOLD_METERS;

  return {
    city,
    setCity,
    cities: SERBIAN_CITIES,
    geoLoading,
    requestGpsLocation,
    signals,
    resolved,
    geoReady,
    geoSource: resolved.source,
    userLocation: userLocationOrigin
      ? {
          lat: userLocationOrigin.lat,
          lng: userLocationOrigin.lng,
          city: userLocationOrigin.city,
        }
      : undefined,
    userLocationSource:
      userLocationOrigin?.source === "gps" ? userLocationOrigin.source : undefined,
    userLocationAccuracyMeters,
    isApproximateLocation,
  };
}

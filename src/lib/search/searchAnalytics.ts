// src/lib/search/searchAnalytics.ts
//
// Phase 2.5A+ Task 21 — Analytics INTERFACES only.
//
// CRITICAL CONSTRAINT (per spec):
//   Do NOT build analytics infrastructure now. Define the trackable events
//   + a no-op sink so call sites can be instrumented today. When a real
//   analytics endpoint is wired (PostHog, Plausible, custom), only the sink
//   implementation changes — call sites stay identical.
//
// The dev-only debug logger from `lib/ai/debug-log` is used as the default
// sink so events are visible in the console during development without
// shipping data anywhere.
import { aiLog } from "@/lib/ai/debug-log";

const log = aiLog("SEARCH_ENGINE");

// ── Event types ───────────────────────────────────────────────────────────────
//
// Each event carries the *minimum* fields we'd want to slice on later. Avoid
// sprinkling free-form metadata — extend the union when a new event type is
// genuinely needed.

export type SearchEvent =
  | {
      type: "search.query";
      /** Original input from user. */
      raw: string;
      /** Canonical normalized form. */
      normalized: string;
      /** Resolved category, when detected. */
      category?: string;
      /** Resolved city. */
      city?: string;
      /** Geo source used for the search (gps, explicit, saved, ip, trending). */
      geoSource?: string;
    }
  | {
      type: "search.city_change";
      /** New city the user picked. */
      city: string;
      /** Previous city, when known. */
      from?: string;
      /** Source of the change: explicit user click vs. geo resolution. */
      via: "explicit" | "gps";
    }
  | {
      type: "search.service_change";
      service: string;
      from?: string;
    }
  | {
      type: "search.result_click";
      /** Slot identity. */
      slotId: string;
      salonId: string;
      serviceId?: string | null;
      /** Position in the ranked list (0-indexed). */
      position: number;
      /** Fallback level the result came from (0–6). */
      fallbackLevel: number;
      /** Strategy that produced the list (quickaccess / bookingwidget / ...). */
      strategy: string;
    }
  | {
      type: "search.fallback_accepted";
      /** Which fallback level was rendered to the user. */
      level: number;
      /** Did the user actually click a result, or bounce?
       *  - `converted: false` is emitted on EXPOSURE (search returned fallback).
       *  - `converted: true` is emitted when the user clicks a fallback slot. */
      converted: boolean;
      /** Slot identity when converted === true. Empty on exposure. */
      slotId?: string;
      salonId?: string;
      serviceId?: string | null;
      /** Strategy that ranked the slot the user clicked. */
      strategy?: string;
      city?: string;
      service?: string;
    }
  | {
      type: "booking.salon_selected";
      salonId: string;
      salonName: string;
      city: string;
      /** Was this salon ranked top-3 in the originating search? */
      wasTopRanked: boolean;
    }
  | {
      type: "booking.confirmed";
      salonId: string;
      serviceId?: string | null;
      /** Distance from user when booked (raw km). */
      distanceKm?: number;
      /** Time between first search and booking, in seconds. */
      ttbSeconds?: number;
    };

// ── Sink ──────────────────────────────────────────────────────────────────────

export interface AnalyticsSink {
  track(event: SearchEvent): void;
}

/** Default sink — no-op in production, debug log in development. */
const defaultSink: AnalyticsSink = {
  track(event) {
    // The debug logger is dev-only by design; production gets nothing until
    // a real sink is plugged in.
    log(`event.${event.type}`, event as unknown as Record<string, unknown>);
  },
};

let activeSink: AnalyticsSink = defaultSink;

/**
 * Plug in a custom analytics sink. Call once at app boot if you wire up
 * PostHog / Plausible / your own endpoint. Re-callable; replaces the sink
 * entirely.
 */
export function setAnalyticsSink(sink: AnalyticsSink): void {
  activeSink = sink;
}

/** Convenience accessor for tests. */
export function resetAnalyticsSink(): void {
  activeSink = defaultSink;
}

/**
 * Public entry point — every search/booking call site uses this. The
 * sink-swap pattern means call sites never need to know whether analytics
 * are enabled.
 */
export function trackSearchEvent(event: SearchEvent): void {
  try {
    activeSink.track(event);
  } catch (err) {
    // Analytics must NEVER break user-facing flows. Swallow + log.
    log("sink.track_failed", { error: String(err) });
  }
}

// src/lib/slots/generateSlots.ts
//
// Phase 2 — Synthetic slot generation with arrival-feasibility gating.
//
// INVARIANTS:
//   - `now` is always injected. Generation loops never call Date.now() internally.
//   - Every candidate is evaluated through resolveArrivalFeasibility before emit.
//   - Hard caps (SYNTHETIC_MAX_*) are enforced per-call AND per-day.
//   - Generated slots always carry slotOrigins + availabilityConfidence tags.
//   - Synthetic generation is a LAST RESORT — callers must only invoke this
//     after confirming real availability returned zero viable candidates.

import type { MappedSalon } from "@/lib/mappers/salonMapper";
import {
  resolveArrivalFeasibility,
  type GeoConfidence,
} from "@/lib/availability/arrivalFeasibility";
import {
  getAvailabilityConfidenceScore,
} from "@/lib/availability/availabilityConfidence";

// ── Hard caps — centralized, documented ──────────────────────────────────────
// Change only with explicit platform decision. These prevent L6 explosion.

/** Max synthetic slots emitted per calendar day in a single (salon × service) call. */
export const SYNTHETIC_MAX_PER_DAY = 5;

/** Max calendar days ahead to project synthetic slots.
 * Was 14 — reduced to prevent unbounded future generation. */
export const SYNTHETIC_MAX_LOOKAHEAD_DAYS = 3;

/** Max total synthetic slots per (salon × service) call. */
export const SYNTHETIC_MAX_TOTAL_PER_CALL = 20;

/** Max total synthetic slots across ALL salons in a single findBestSlots L6 call.
 * This is the global circuit breaker — prevents the 2520-slot explosion. */
export const SYNTHETIC_GLOBAL_CAP = 60;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GeneratedSlot {
  startTime: string; // "YYYY-MM-DDTHH:MM:00" Belgrade local-time (no TZ suffix)
  endTime: string;
  isSynthetic: boolean;
  slotOrigins: ["synthetic"] | ["real"];
  availabilityConfidence: "working_hours_only" | "synthetic_projection";
  availabilityConfidenceScore: number;
  availabilityType: "working_hours" | "synthetic";
}

export interface SyntheticGenerationOptions {
  /** Injected wall clock — never call Date.now() inside generation.
   * Defaults to new Date() AT CALL ENTRY only (not inside loops). */
  now?: Date;
  daysAhead?: number;
  serviceDuration?: number;
  // Feasibility context — used to gate each slot
  distanceKm?: number;
  geoConfidence?: GeoConfidence;
  cityMatch?: boolean;
  // Hard cap overrides (default to SYNTHETIC_MAX_* constants)
  maxPerDay?: number;
  maxTotal?: number;
  /** Inclusive local Europe/Belgrade hour lower bound. */
  timeWindowStart?: number | null;
  /** Inclusive local Europe/Belgrade hour upper bound; null means open-ended. */
  timeWindowEnd?: number | null;
  /**
   * Availability context controls slot tagging:
   * - "working_hours_only" (default): real salon + real working hours, no calendar data.
   *   Emits isSynthetic=false, availabilityConfidence="working_hours_only", slotOrigins=["real"].
   *   Valid for QuickAccess MVP.
   * - "synthetic_projection": L6 last-resort fallback. Emits isSynthetic=true,
   *   availabilityConfidence="synthetic_projection", slotOrigins=["synthetic"].
   *   Blocked by QuickAccess policy.
   */
  context?: "working_hours_only" | "synthetic_projection";
}

export interface SyntheticGenerationDebug {
  /** Total time-steps visited in generation loop (before any filter). */
  generated: number;
  /** Slots that passed feasibility and fit within caps. */
  accepted: number;
  /** Slots rejected by resolveArrivalFeasibility. */
  rejectedByFeasibility: number;
  /** True when generation was halted by a hard cap. */
  capHit: boolean;
}

export interface SyntheticGenerationResult {
  slots: GeneratedSlot[];
  debug: SyntheticGenerationDebug;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const DOW_TO_DAY: Record<number, string> = {
  0: "Nedelja",
  1: "Ponedeljak",
  2: "Utorak",
  3: "Sreda",
  4: "Četvrtak",
  5: "Petak",
  6: "Subota",
};

function parseHoursRange(str: string): { openMin: number; closeMin: number } | null {
  const m = str.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return {
    openMin: parseInt(m[1], 10) * 60 + parseInt(m[2], 10),
    closeMin: parseInt(m[3], 10) * 60 + parseInt(m[4], 10),
  };
}

/** YYYY-MM-DD for a given date in Europe/Belgrade */
function belgradeDateStr(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(date);
}

/** Day-of-week (0=Sun) in Europe/Belgrade */
function belgradeDow(date: Date): number {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Belgrade",
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[short] ?? date.getDay();
}

/** Current time as total minutes since midnight in Europe/Belgrade for a given Date. */
function belgradeMinutesAt(date: Date): number {
  const timeStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Belgrade",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const parts = timeStr.replace("24:", "00:").split(":");
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate synthetic (workingHours-projected) slots for a single salon.
 *
 * Every candidate is evaluated through resolveArrivalFeasibility. Only
 * feasible slots are emitted. Hard caps prevent L6 explosion.
 *
 * CALLERS: invoke only after confirming real availability is empty.
 * This is a recovery layer, not a primary availability source.
 */
export function generateSlotsFromWorkingHours(
  salon: MappedSalon,
  opts: SyntheticGenerationOptions = {},
): SyntheticGenerationResult {
  // Resolve `now` once at entry — never call Date.now() in loops
  const now = opts.now ?? new Date();

  const daysAhead = Math.min(
    opts.daysAhead ?? SYNTHETIC_MAX_LOOKAHEAD_DAYS,
    SYNTHETIC_MAX_LOOKAHEAD_DAYS,
  );

  const serviceDuration =
    opts.serviceDuration ??
    salon.services?.[0]?.duration ??
    30;

  const step = Math.max(serviceDuration, 15);

  const effectiveMaxPerDay = opts.maxPerDay ?? SYNTHETIC_MAX_PER_DAY;
  const effectiveMaxTotal = opts.maxTotal ?? SYNTHETIC_MAX_TOTAL_PER_CALL;

  const result: GeneratedSlot[] = [];
  const debug: SyntheticGenerationDebug = {
    generated: 0,
    accepted: 0,
    rejectedByFeasibility: 0,
    capHit: false,
  };

  const nowBelgradeMin = belgradeMinutesAt(now);
  const todayBelgrade = belgradeDateStr(now);

  for (let d = 0; d < daysAhead; d++) {
    if (debug.accepted >= effectiveMaxTotal) {
      debug.capHit = true;
      break;
    }

    // Build the candidate date by advancing from `now` — deterministic
    const date = new Date(now.getTime());
    date.setDate(date.getDate() + d);

    const dow = belgradeDow(date);
    const dayKey = DOW_TO_DAY[dow];
    const hoursStr = salon.workingHours?.[dayKey];
    if (!hoursStr) continue;

    const range = parseHoursRange(hoursStr);
    if (!range) continue;

    const dateStr = belgradeDateStr(date);
    const isToday = dateStr === todayBelgrade;
    let perDayCount = 0;

    for (let m = range.openMin; m + serviceDuration <= range.closeMin; m += step) {
      const slotHour = Math.floor(m / 60);
      if (opts.timeWindowStart != null && slotHour < opts.timeWindowStart) continue;
      if (opts.timeWindowEnd != null && slotHour > opts.timeWindowEnd) continue;

      if (debug.accepted >= effectiveMaxTotal) {
        debug.capHit = true;
        break;
      }
      if (perDayCount >= effectiveMaxPerDay) break;

      // Skip obviously past times on today without running full feasibility
      if (isToday && m <= nowBelgradeMin) continue;

      const hh = Math.floor(m / 60).toString().padStart(2, "0");
      const mm = (m % 60).toString().padStart(2, "0");
      const startTime = `${dateStr}T${hh}:${mm}:00`;
      debug.generated++;

      // Arrival feasibility gate — every slot must pass before emit
      const feasibility = resolveArrivalFeasibility({
        now,
        slotStartTime: new Date(startTime),
        distanceKm: opts.distanceKm,
        geoConfidence: opts.geoConfidence,
        cityMatch: opts.cityMatch,
      });

      if (!feasibility.feasible) {
        debug.rejectedByFeasibility++;
        continue;
      }

      const endM = m + serviceDuration;
      const eh = Math.floor(endM / 60).toString().padStart(2, "0");
      const em = (endM % 60).toString().padStart(2, "0");
      const endTime = `${dateStr}T${eh}:${em}:00`;

      const isSyntheticProjection = (opts.context ?? "synthetic_projection") === "synthetic_projection";
      const availabilityConfidence = isSyntheticProjection
        ? "synthetic_projection"
        : "working_hours_only";
      result.push({
        startTime,
        endTime,
        isSynthetic: isSyntheticProjection,
        slotOrigins: isSyntheticProjection ? ["synthetic"] : ["real"],
        availabilityConfidence,
        availabilityConfidenceScore: getAvailabilityConfidenceScore(availabilityConfidence),
        availabilityType: isSyntheticProjection ? "synthetic" : "working_hours",
      });
      debug.accepted++;
      perDayCount++;
    }
  }

  return { slots: result, debug };
}

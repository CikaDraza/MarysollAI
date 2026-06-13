// src/lib/date/bookingDateResolver.ts
//
// Canonical booking-date resolver — the SINGLE source of truth for turning a
// free-text Serbian/English message into a concrete booking date. It is a thin
// adapter over the search engine's deterministic parser
// (`lib/intent/parseIntent` — detectDatetime/nextWeekday/WEEKDAYS) so that the
// AI chat (Claudia) and the search route resolve dates identically.
//
// Why: previously Claudia used its own tiny detector that knew only
// danas/sutra and mapped "nedelja" → "weekend", so "utorak" became tomorrow and
// "u nedelju" became today. This reuses the correct weekday logic instead of
// duplicating it.

import {
  detectDatetime,
  stripDiacritics,
  weekdayIndexFromText,
} from "@/lib/intent/parseIntent";

export type BookingDateMode =
  | "today"
  | "tomorrow"
  | "day_after_tomorrow"
  | "weekday"
  | "weekend"
  | "explicit";

export interface ResolvedBookingDate {
  /** Concrete ISO date "YYYY-MM-DD". Absent only for pure "weekend" (ambiguous). */
  date?: string;
  dateMode?: BookingDateMode;
  /** Serbian weekday name when `dateMode === "weekday"` (e.g. "utorak"). */
  weekday?: string;
  confidence: number;
}

/** Serbian weekday names indexed by JS getDay() (0 = Sunday). */
const SR_WEEKDAY_NAMES = [
  "nedelja",
  "ponedeljak",
  "utorak",
  "sreda",
  "četvrtak",
  "petak",
  "subota",
] as const;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve a booking date from free text. `now` is injectable for deterministic
 * tests. Returns a concrete `date` whenever the message names a day; a bare
 * "vikend" stays mode-only ("weekend") because it isn't a single day.
 */
export function resolveBookingDate(
  text: string,
  now: Date = new Date(),
): ResolvedBookingDate {
  const norm = stripDiacritics(text);

  // "vikend" is a range, not a single day — keep it separate from "nedelja"
  // (Sunday), which is resolved as a concrete weekday below.
  if (/\bvikend/.test(norm)) {
    return { dateMode: "weekend", confidence: 0.75 };
  }

  const dt = detectDatetime(norm, text, now);

  switch (dt.type) {
    case "today":
      return { date: isoDate(now), dateMode: "today", confidence: 0.95 };
    case "tomorrow": {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      return { date: isoDate(d), dateMode: "tomorrow", confidence: 0.95 };
    }
    case "day_after_tomorrow":
      return {
        date: dt.value,
        dateMode: "day_after_tomorrow",
        confidence: 0.9,
      };
    case "date": {
      const wd = weekdayIndexFromText(norm);
      if (wd !== null) {
        return {
          date: dt.value,
          dateMode: "weekday",
          weekday: SR_WEEKDAY_NAMES[wd],
          confidence: 0.9,
        };
      }
      // explicit "15.06" form
      return { date: dt.value, dateMode: "explicit", confidence: 0.85 };
    }
    default:
      return { confidence: 0 };
  }
}

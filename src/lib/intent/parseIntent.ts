/**
 * Intent Engine — converts free text (Serbian or English) into a structured
 * booking intent. Rule-based, no LLM, deterministic.
 *
 * Pipeline: strip diacritics → detect city → detect category → detect datetime
 */
import { SERBIAN_CITIES } from "@/lib/cities";
import { cityLocative } from "@/lib/seo/cityGrammar";
import { CATEGORY_MAP, type CategorySlug } from "./categoryMap";

// ── Types ────────────────────────────────────────────────────────────────────

export interface BookingIntent {
  city: string | null;
  category: CategorySlug | null;
  subcategory: string | null;
  datetime: {
    type: "today" | "tomorrow" | "day_after_tomorrow" | "date" | "any";
    value?: string;  // ISO date "YYYY-MM-DD", only when type === "date" or "day_after_tomorrow"
    time?: string;   // "HH:MM" — specific time or representative time-of-day
    timeWindowStart?: number; // hour (inclusive), set for time-of-day phrases
    timeWindowEnd?: number;   // hour (inclusive)
  };
}

// ── Normalization ─────────────────────────────────────────────────────────────

export function stripDiacritics(s: string): string {
  return s
    .toLowerCase()
    .replace(/š/g, "s")
    .replace(/đ/g, "dj")
    .replace(/ž/g, "z")
    .replace(/č/g, "c")
    .replace(/ć/g, "c")
    .replace(/[ʼ'''`]/g, "")
    .trim();
}

// ── City ──────────────────────────────────────────────────────────────────────

function detectCity(norm: string): string | null {
  // Match nominative AND locative forms ("Kruševac" + "u Kruševcu", "Novi Sad"
  // + "u Novom Sadu"), because users type the declined form after "u". Longest
  // form first so "Sremska Mitrovica" beats "Sremska", and a multi-word locative
  // beats a shorter city's nominative.
  const forms: { form: string; name: string }[] = [];
  for (const city of SERBIAN_CITIES) {
    forms.push({ form: stripDiacritics(city.name), name: city.name });
    const loc = cityLocative(city.name);
    if (loc !== city.name) {
      forms.push({ form: stripDiacritics(loc), name: city.name });
    }
  }
  forms.sort((a, b) => b.form.length - a.form.length);
  for (const { form, name } of forms) {
    if (form && norm.includes(form)) return name.toLowerCase();
  }
  return null;
}

// ── Category ──────────────────────────────────────────────────────────────────

function detectCategory(norm: string): CategorySlug | null {
  for (const [slug, synonyms] of CATEGORY_MAP) {
    for (const syn of synonyms) {
      if (norm.includes(syn)) return slug;
    }
  }
  return null;
}

// ── Subcategory ───────────────────────────────────────────────────────────────

const SUBCATEGORY_HINTS: [string, string][] = [
  ["muski", "muški"],
  ["zenski", "ženski"],
  ["deciji", "dečiji"],
  ["kratka", "kratka kosa"],
  ["duga", "duga kosa"],
  ["klasicna", "klasična"],
  ["sportska", "sportska"],
  ["relax", "relax"],
  ["hot stone", "hot stone"],
  ["french", "french"],
  ["akril", "akrilne"],
  ["gel", "gel"],
];

function detectSubcategory(norm: string): string | null {
  for (const [key, label] of SUBCATEGORY_HINTS) {
    if (norm.includes(key)) return label;
  }
  return null;
}

// ── Time-of-day phrases ───────────────────────────────────────────────────────

interface TimeOfDayRule {
  patterns: string[];
  time: string;          // representative HH:MM for search centering
  windowStart: number;   // hour (inclusive)
  windowEnd: number;     // hour (inclusive)
}

const TIME_OF_DAY_RULES: TimeOfDayRule[] = [
  {
    patterns: ["ujutru", "jutros", "jutro", "morning", "prepodne", "pre podne"],
    time: "09:00",
    windowStart: 8,
    windowEnd: 12,
  },
  {
    patterns: ["popodne", "poslepodne", "posle podne", "afternoon"],
    time: "14:00",
    windowStart: 12,
    windowEnd: 17,
  },
  {
    patterns: ["uvece", "vecer", "veceras", "tonight", "evening"],
    time: "19:00",
    windowStart: 18,
    windowEnd: 22,
  },
  {
    patterns: ["nocu", "kasno", "late night"],
    time: "21:00",
    windowStart: 20,
    windowEnd: 23,
  },
];

interface TimeResult {
  time?: string;
  timeWindowStart?: number;
  timeWindowEnd?: number;
}

function detectTime(norm: string, raw: string): TimeResult {
  // 1. Check time-of-day phrases first (highest priority)
  for (const rule of TIME_OF_DAY_RULES) {
    if (rule.patterns.some((p) => norm.includes(p))) {
      return {
        time: rule.time,
        timeWindowStart: rule.windowStart,
        timeWindowEnd: rule.windowEnd,
      };
    }
  }

  // 2. Explicit "15:30" or "15.30"
  const hhmm = raw.match(/\b(\d{1,2})[:.h](\d{2})\b/);
  if (hhmm) {
    const h = parseInt(hhmm[1], 10);
    if (h >= 0 && h <= 23) {
      return { time: `${hhmm[1].padStart(2, "0")}:${hhmm[2]}` };
    }
  }

  // 3. "u 15", "at 15", "oko 15", "posle 14", "around 9"
  const triggered = raw.match(
    /\b(?:u|at|oko|around|posle|after|od)\s+(\d{1,2})(?:\s*h)?\b/i,
  );
  if (triggered) {
    const h = parseInt(triggered[1], 10);
    if (h >= 0 && h <= 23) return { time: `${triggered[1].padStart(2, "0")}:00` };
  }

  // 4. Standalone "15h" or "9h"
  const hourSuffix = raw.match(/\b(\d{1,2})h\b/i);
  if (hourSuffix) {
    const h = parseInt(hourSuffix[1], 10);
    if (h >= 0 && h <= 23) return { time: `${hourSuffix[1].padStart(2, "0")}:00` };
  }

  return {};
}

// ── Weekday resolution ────────────────────────────────────────────────────────

const WEEKDAYS: [string, number][] = [
  ["ponedeljak", 1], ["ponedeljkom", 1],
  ["utorak", 2],     ["utorkom", 2],
  ["sredu", 3],      ["sreda", 3], ["sredom", 3],
  ["cetvrtak", 4],   ["cetvrtkom", 4],
  ["petak", 5],      ["petkom", 5],
  ["subotu", 6],     ["subota", 6], ["subotom", 6],
  ["nedelju", 0],    ["nedelja", 0], ["nedeljom", 0],
  ["sunday", 0], ["monday", 1], ["tuesday", 2], ["wednesday", 3],
  ["thursday", 4], ["friday", 5], ["saturday", 6],
];

function nextWeekday(target: number, now: Date = new Date()): string {
  let diff = target - now.getDay();
  if (diff <= 0) diff += 7;
  const d = new Date(now);
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Matched Serbian/English weekday → day index (0=Sunday), or null. `norm`
 *  must be diacritic-stripped (see {@link stripDiacritics}). Exported so the
 *  canonical booking-date resolver can reuse the single weekday lexicon. */
export function weekdayIndexFromText(norm: string): number | null {
  for (const [word, dayNum] of WEEKDAYS) {
    if (norm.includes(word)) return dayNum;
  }
  return null;
}

// ── Datetime ──────────────────────────────────────────────────────────────────

export function detectDatetime(
  norm: string,
  raw: string,
  now: Date = new Date(),
): BookingIntent["datetime"] {
  const timeResult = detectTime(norm, raw);

  if (norm.includes("danas") || norm.includes("today")) {
    return { type: "today", ...timeResult };
  }

  // "prekosutra" / "day after tomorrow" must be checked BEFORE "sutra"
  // because "prekosutra".includes("sutra") would otherwise short-circuit
  // to tomorrow.
  if (norm.includes("prekosutra") || norm.includes("day after tomorrow")) {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    return {
      type: "day_after_tomorrow",
      value: d.toISOString().slice(0, 10),
      ...timeResult,
    };
  }

  if (
    norm.includes("sutra") ||
    norm.includes("sjutra") ||
    norm.includes("tomorrow")
  ) {
    return { type: "tomorrow", ...timeResult };
  }

  for (const [word, dayNum] of WEEKDAYS) {
    if (norm.includes(word)) {
      return { type: "date", value: nextWeekday(dayNum, now), ...timeResult };
    }
  }

  // Explicit "15.6", "15/6", "15.06.2025"
  const dateMatch = raw.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?\b/);
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, "0");
    const month = dateMatch[2].padStart(2, "0");
    const year = dateMatch[3] ?? now.getFullYear().toString();
    return { type: "date", value: `${year}-${month}-${day}`, ...timeResult };
  }

  return { type: "any", ...timeResult };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function parseIntent(text: string): BookingIntent {
  const norm = stripDiacritics(text);

  return {
    city:        detectCity(norm),
    category:    detectCategory(norm),
    subcategory: detectSubcategory(norm),
    datetime:    detectDatetime(norm, text),
  };
}

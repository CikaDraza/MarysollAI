/**
 * Intent Engine — converts free text (Serbian or English) into a structured
 * booking intent. Rule-based, no LLM, deterministic.
 *
 * Pipeline: strip diacritics → detect city → detect category → detect datetime
 */
import { SERBIAN_CITIES } from "@/lib/cities";
import { CATEGORY_MAP, type CategorySlug } from "./categoryMap";

// ── Types ────────────────────────────────────────────────────────────────────

export interface BookingIntent {
  city: string | null;
  category: CategorySlug | null;
  subcategory: string | null;
  datetime: {
    type: "today" | "tomorrow" | "date" | "any";
    value?: string; // ISO date "YYYY-MM-DD", only when type === "date"
    time?: string;  // "HH:MM"
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
  // Sort by name length descending — "Sremska Mitrovica" before "Sremska"
  const sorted = [...SERBIAN_CITIES].sort((a, b) => b.name.length - a.name.length);
  for (const city of sorted) {
    if (norm.includes(stripDiacritics(city.name))) {
      return city.name.toLowerCase();
    }
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

// ── Time ──────────────────────────────────────────────────────────────────────

function detectTime(raw: string): string | undefined {
  // "15:30" or "15.30" (HH.MM)
  const hhmm = raw.match(/\b(\d{1,2})[:.h](\d{2})\b/);
  if (hhmm) {
    const h = parseInt(hhmm[1], 10);
    if (h >= 0 && h <= 23) {
      return `${hhmm[1].padStart(2, "0")}:${hhmm[2]}`;
    }
  }

  // "u 15", "at 15", "oko 15", "posle 14", "around 9"
  const triggered = raw.match(
    /\b(?:u|at|oko|around|posle|after|od)\s+(\d{1,2})(?:\s*h)?\b/i,
  );
  if (triggered) {
    const h = parseInt(triggered[1], 10);
    if (h >= 0 && h <= 23) return `${triggered[1].padStart(2, "0")}:00`;
  }

  // Standalone "15h" or "9h"
  const hourSuffix = raw.match(/\b(\d{1,2})h\b/i);
  if (hourSuffix) {
    const h = parseInt(hourSuffix[1], 10);
    if (h >= 0 && h <= 23) return `${hourSuffix[1].padStart(2, "0")}:00`;
  }

  return undefined;
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

function nextWeekday(target: number): string {
  const now = new Date();
  let diff = target - now.getDay();
  if (diff <= 0) diff += 7;
  const d = new Date(now);
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

// ── Datetime ──────────────────────────────────────────────────────────────────

function detectDatetime(norm: string, raw: string): BookingIntent["datetime"] {
  const time = detectTime(raw);

  if (norm.includes("danas") || norm.includes("today")) {
    return { type: "today", time };
  }

  if (
    norm.includes("sutra") ||
    norm.includes("sjutra") ||
    norm.includes("tomorrow")
  ) {
    return { type: "tomorrow", time };
  }

  for (const [word, dayNum] of WEEKDAYS) {
    if (norm.includes(word)) {
      return { type: "date", value: nextWeekday(dayNum), time };
    }
  }

  // Explicit "15.6", "15/6", "15.06.2025"
  const dateMatch = raw.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?\b/);
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, "0");
    const month = dateMatch[2].padStart(2, "0");
    const year = dateMatch[3] ?? new Date().getFullYear().toString();
    return { type: "date", value: `${year}-${month}-${day}`, time };
  }

  return { type: "any", time };
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

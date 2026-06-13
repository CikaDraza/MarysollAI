// src/lib/search/searchFallback.ts
//
// Phase 2.5A — Fallback metadata helper.
//
// findBestSlots already returns `{ fallbackLevel, fallbackLabel }` from a
// 6-level fallback engine. This module exposes a public API that the rest of
// the app can use to:
//   - render a friendly explanation ("Najbliži termini u susednim gradovima")
//   - decide whether to show a "we expanded the search" notice
//   - log / debug the path taken
//
// We intentionally do NOT re-implement the fallback chain — that lives in
// findBestSlots. This module is metadata + display only.
import { aiLog } from "@/lib/ai/debug-log";

const log = aiLog("FALLBACK");

export type FallbackLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface FallbackInfo {
  level: FallbackLevel;
  label: string;
  /** Short Serbian phrase to render to the user. Empty when level === 1 or 0. */
  userMessage: string;
  /** True when results came from a non-exact match. UI uses this to show a
   * subtle "proširili smo pretragu" hint. */
  isExpanded: boolean;
  /** True when results are entirely synthetic (generated from working hours). */
  isSynthetic: boolean;
  /** True when nothing was found at all. UI should show a recovery CTA. */
  isEmpty: boolean;
}

const FALLBACK_INFO: Record<FallbackLevel, Omit<FallbackInfo, "level">> = {
  0: {
    label: "no-salons",
    userMessage:
      "Trenutno nema dostupnih termina. Pokušajte ponovo malo kasnije.",
    isExpanded: false,
    isSynthetic: false,
    isEmpty: true,
  },
  1: {
    label: "exact",
    userMessage: "",
    isExpanded: false,
    isSynthetic: false,
    isEmpty: false,
  },
  2: {
    label: "relaxed-time",
    userMessage:
      "Nema termina u tačno traženo vreme — pokazujemo druge termine istog dana.",
    isExpanded: true,
    isSynthetic: false,
    isEmpty: false,
  },
  3: {
    label: "related-categories",
    userMessage:
      "Tvoja usluga nije dostupna — pokazujemo slične dostupne tretmane.",
    isExpanded: true,
    isSynthetic: false,
    isEmpty: false,
  },
  4: {
    label: "nearest-future",
    userMessage:
      "Najbliži slobodni termini u tvom gradu — možda nisu tačno za traženi datum.",
    isExpanded: true,
    isSynthetic: false,
    isEmpty: false,
  },
  5: {
    label: "nearby-cities",
    userMessage:
      "U tvom gradu nema slobodnih termina — pokazujemo termine u susednim gradovima.",
    isExpanded: true,
    isSynthetic: false,
    isEmpty: false,
  },
  6: {
    label: "synthetic",
    userMessage:
      "Predlog termina iz radnog vremena salona. Potvrdi pri zakazivanju.",
    isExpanded: true,
    isSynthetic: true,
    isEmpty: false,
  },
};

/**
 * Resolve fallback metadata from the level returned by findBestSlots.
 * Always returns a usable FallbackInfo — never throws on unknown level.
 */
export function resolveSearchFallback(
  level: number,
  label?: string,
): FallbackInfo {
  const safeLevel = (
    Number.isInteger(level) && level >= 0 && level <= 6 ? level : 0
  ) as FallbackLevel;

  const meta = FALLBACK_INFO[safeLevel];
  log("resolved", { level: safeLevel, label: label ?? meta.label });

  return {
    ...meta,
    level: safeLevel,
    label: label ?? meta.label,
  };
}

/**
 * True when the caller should render a "we expanded the search" UI hint.
 * Convenience over reading `info.isExpanded` directly so consumers can change
 * the display rule in one place if needed (e.g. only show for L4+).
 */
export function shouldShowFallbackHint(info: FallbackInfo): boolean {
  return info.isExpanded && !info.isEmpty;
}

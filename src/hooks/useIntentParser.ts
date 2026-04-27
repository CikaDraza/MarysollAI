"use client";
import { useCallback, useState } from "react";
import { parseIntent, type BookingIntent } from "@/lib/intent/parseIntent";
import { SLUG_TO_CANONICAL } from "@/lib/intent/categoryMap";
import { findCity, type SerbianCity } from "@/lib/cities";

export interface ResolvedIntent {
  raw: BookingIntent;
  /** canonical category string for slot filter, e.g. "Masaža" */
  canonicalCategory: string | null;
  /** SerbianCity object if city matched, null otherwise */
  resolvedCity: SerbianCity | null;
}

export function useIntentParser() {
  const [intent, setIntent] = useState<ResolvedIntent | null>(null);

  const parse = useCallback((text: string): ResolvedIntent => {
    const raw = parseIntent(text);

    const resolved: ResolvedIntent = {
      raw,
      canonicalCategory: raw.category ? SLUG_TO_CANONICAL[raw.category] : null,
      resolvedCity: raw.city ? findCity(raw.city) ?? null : null,
    };

    setIntent(resolved);
    return resolved;
  }, []);

  const reset = useCallback(() => setIntent(null), []);

  return { intent, parse, reset };
}

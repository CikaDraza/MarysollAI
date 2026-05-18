// src/lib/geo/canonicalCity.ts
//
// Map any free-form city string (DB casing, missing diacritics, stray
// whitespace) to the canonical SERBIAN_CITIES name. Returns the input
// (trimmed) when there is no match so unknown cities still bucket
// stably.

import { SERBIAN_CITIES } from "@/lib/cities";
import { stripDiacritics } from "@/lib/intent/parseIntent";

export function canonicalCity(input: string | undefined | null): string {
  if (!input) return "";
  const norm = stripDiacritics(input).trim();
  if (!norm) return "";
  const match = SERBIAN_CITIES.find(
    (c) => stripDiacritics(c.name) === norm,
  );
  return match ? match.name : input.trim();
}

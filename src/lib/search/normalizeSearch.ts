// src/lib/search/normalizeSearch
import { stripDiacritics } from "@/lib/intent/parseIntent";
import {
  CATEGORY_MAP,
  CANONICAL_TO_SLUG,
  SLUG_TO_CANONICAL,
  type CategorySlug,
} from "@/lib/intent/categoryMap";
import { resolveCategoryOnly } from "@/lib/search/categoryResolver";
import { SERBIAN_CITIES, type SerbianCity, findCity } from "@/lib/cities";
import type { PlatformCategory } from "@/types/category-types";

export interface NormalizedSearch {
  citySlug: string; // "novi-sad"
  cityDisplay: string; // "Novi Sad"
  cityRef?: SerbianCity;
  category?: CategorySlug;
  canonicalCategory?: string; // "Nokti", "Masaža" — for matching platform DB values
  subcategoryNorm?: string; // diacritics stripped
  serviceCandidateNorms?: string[]; // deterministic semantic expansion terms
  rawQuery?: string;
  date: string; // YYYY-MM-DD in Europe/Belgrade
  requestedHour?: number;
  timeWindowStart?: number; // hour (inclusive lower bound, requestedHour - 1)
  timeWindowEnd?: number; // hour (inclusive upper bound, requestedHour + 2)
  lat?: number;
  lng?: number;
  limit: number;
}

// Returns YYYY-MM-DD in Europe/Belgrade timezone
export function todayInBelgrade(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Belgrade",
  }).format(new Date());
}

export function tomorrowInBelgrade(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Belgrade",
  }).format(d);
}

function slugToDisplayName(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function resolveCity(raw: string): {
  slug: string;
  display: string;
  ref?: SerbianCity;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    const fallback = SERBIAN_CITIES[0]; // Novi Sad
    return {
      slug: fallback.name.toLowerCase().replace(/\s+/g, "-"),
      display: fallback.name,
      ref: fallback,
    };
  }

  // Exact display name match ("Novi Sad")
  const direct = findCity(trimmed);
  if (direct) {
    return {
      slug: direct.name.toLowerCase().replace(/\s+/g, "-"),
      display: direct.name,
      ref: direct,
    };
  }

  // URL slug match ("novi-sad" → "Novi Sad")
  const fromSlugName = slugToDisplayName(trimmed);
  const fromSlug = findCity(fromSlugName);
  if (fromSlug) {
    return {
      slug: trimmed.toLowerCase(),
      display: fromSlug.name,
      ref: fromSlug,
    };
  }

  // Diacritics-stripped fuzzy match
  const normRaw = stripDiacritics(trimmed).replace(/-/g, " ");
  const fuzzy = SERBIAN_CITIES.find((c) => stripDiacritics(c.name) === normRaw);
  if (fuzzy) {
    return {
      slug: fuzzy.name.toLowerCase().replace(/\s+/g, "-"),
      display: fuzzy.name,
      ref: fuzzy,
    };
  }

  // Unknown city — use raw, fallback to Beograd ref
  const beogradRef = SERBIAN_CITIES.find((c) => c.name === "Beograd");
  return {
    slug: trimmed.toLowerCase().replace(/\s+/g, "-"),
    display: fromSlugName || trimmed,
    ref: beogradRef,
  };
}

function resolveCategory(
  raw: string,
  categories?: PlatformCategory[],
): { slug?: CategorySlug; canonical?: string } {
  if (!raw) return {};

  // Already a valid slug
  if (raw in SLUG_TO_CANONICAL) {
    return {
      slug: raw as CategorySlug,
      canonical: SLUG_TO_CANONICAL[raw as CategorySlug],
    };
  }

  // Serbian canonical label ("Masaža", "Nokti", ...)
  const fromCanonical = CANONICAL_TO_SLUG[raw];
  if (fromCanonical) {
    return { slug: fromCanonical, canonical: raw };
  }

  // DB-driven fuzzy match (category-level synonyms from platform)
  if (categories?.length) {
    const dbKey = resolveCategoryOnly(raw, categories);
    if (dbKey && dbKey in SLUG_TO_CANONICAL) {
      const slug = dbKey as CategorySlug;
      return { slug, canonical: SLUG_TO_CANONICAL[slug] };
    }

    // Batch 3 — subcategory.synonyms fallback. When the user types a
    // service-level term like "akril" or "balayage" that no category-level
    // synonym matches, walk subcategories[].{key,label,synonyms} and derive
    // the parent category from the subcategory hit. This is the live win
    // of dynamic DB synonyms: salons can add a service with custom synonyms
    // and search picks it up within the 5-min cache window.
    const norm = stripDiacritics(raw.toLowerCase().trim());
    for (const cat of categories) {
      for (const sub of cat.subcategories ?? []) {
        const terms = [sub.key, sub.label, ...(sub.synonyms ?? [])]
          .filter(Boolean)
          .map((t) => stripDiacritics(t.toLowerCase()));
        if (
          terms.some(
            (t) =>
              t === norm || norm.includes(t) || (t.length >= 3 && t.includes(norm)),
          )
        ) {
          if (cat.key in SLUG_TO_CANONICAL) {
            const slug = cat.key as CategorySlug;
            return { slug, canonical: SLUG_TO_CANONICAL[slug] };
          }
        }
      }
    }
  }

  // Hardcoded CATEGORY_MAP as final fallback (parseIntent.ts parity)
  const norm = stripDiacritics(raw);
  for (const [slug, synonyms] of CATEGORY_MAP) {
    if (synonyms.some((s) => norm.includes(s) || s.includes(norm))) {
      return { slug, canonical: SLUG_TO_CANONICAL[slug] };
    }
  }

  return {};
}

export function normalizeSearch(params: {
  city?: string;
  category?: string;
  subcategory?: string;
  date?: string;
  time?: string;
  timeWindowStart?: string | number;
  timeWindowEnd?: string | number;
  lat?: string | number;
  lng?: string | number;
  limit?: string | number;
  rawQuery?: string;
  serviceCandidates?: string[];
  categories?: PlatformCategory[];
}): NormalizedSearch {
  const today = todayInBelgrade();

  const cityNorm = resolveCity(params.city ?? "Beograd");
  const catNorm = resolveCategory(params.category ?? "", params.categories);

  const date = params.date ?? today;

  let requestedHour: number | undefined;
  let timeWindowStart: number | undefined;
  let timeWindowEnd: number | undefined;

  // Explicit window from intent parser takes precedence over derived window
  const explicitStart =
    params.timeWindowStart !== undefined && params.timeWindowStart !== ""
      ? Number(params.timeWindowStart)
      : undefined;
  const explicitEnd =
    params.timeWindowEnd !== undefined && params.timeWindowEnd !== ""
      ? Number(params.timeWindowEnd)
      : undefined;

  if (explicitStart != null && !isNaN(explicitStart)) {
    timeWindowStart = Math.max(0, explicitStart);
    timeWindowEnd = explicitEnd != null && !isNaN(explicitEnd)
      ? Math.min(23, explicitEnd)
      : Math.min(23, explicitStart + 3);
    requestedHour = Math.round((timeWindowStart + (timeWindowEnd ?? timeWindowStart)) / 2);
  } else if (params.time) {
    const parts = params.time.split(":");
    const h = parseInt(parts[0], 10);
    if (!isNaN(h) && h >= 0 && h <= 23) {
      requestedHour = h;
      timeWindowStart = Math.max(0, h - 1);
      timeWindowEnd = Math.min(23, h + 2);
    }
  }

  const subcategoryNorm = params.subcategory
    ? stripDiacritics(params.subcategory.trim())
    : undefined;
  const serviceCandidateNorms = [
    ...new Set(
      (params.serviceCandidates ?? [])
        .map((term) => stripDiacritics(term.trim()).toLowerCase())
        .filter(Boolean),
    ),
  ];

  const lat =
    params.lat !== undefined && params.lat !== ""
      ? Number(params.lat)
      : undefined;
  const lng =
    params.lng !== undefined && params.lng !== ""
      ? Number(params.lng)
      : undefined;
  const limit = params.limit
    ? Math.min(Math.max(1, Number(params.limit)), 50)
    : 20;

  return {
    citySlug: cityNorm.slug,
    cityDisplay: cityNorm.display,
    cityRef: cityNorm.ref,
    category: catNorm.slug,
    canonicalCategory: catNorm.canonical,
    subcategoryNorm,
    serviceCandidateNorms,
    rawQuery: params.rawQuery,
    date,
    requestedHour,
    timeWindowStart,
    timeWindowEnd,
    lat,
    lng,
    limit,
  };
}

/** Match a salon's city string against the normalized city */
export function cityMatches(
  salonCity: string | undefined,
  norm: NormalizedSearch,
): boolean {
  if (!salonCity) return false;
  const salonNorm = stripDiacritics(salonCity);
  const targetNorm = stripDiacritics(norm.cityDisplay);
  return (
    salonNorm === targetNorm ||
    salonNorm.includes(targetNorm) ||
    targetNorm.includes(salonNorm)
  );
}

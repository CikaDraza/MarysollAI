// Content-threshold gating for programmatic SEO pages.
//
// A /{city}/{category} page is only worth indexing when it has real inventory.
// Threshold (per the agreed plan): at least one salon that OFFERS the category
// AND has a useful signal — a priced service OR an upcoming slot OR a valid card
// (name + city). Pages with no such salon are marked noindex to avoid thin /
// doorway pages.
//
// Manual overrides in `seoOverrides.ts` always win over this automatic result.

import "server-only";
import {
  fetchSearchSalonProfiles,
  fetchSearchSalonServices,
} from "@/lib/search/fetchSearchPlatformData";
import { mapSalon, type MappedSalon } from "@/lib/mappers/salonMapper";
import type { PlatformSalon } from "@/lib/api/platformClient";
import {
  VALID_CATEGORY_SLUGS,
  CANONICAL_TO_SLUG,
  type CategorySlug,
} from "@/lib/intent/categoryMap";
import { canonicalCity } from "@/lib/geo/canonicalCity";
import { todayInBelgrade, tomorrowInBelgrade } from "@/lib/search/normalizeSearch";
import { cityToSlug, ALL_CITIES_SLUG } from "@/lib/seo/citySlug";
import { categoryToUrlSlug } from "@/lib/seo/categoryUrlSlug";
import { fetchSalonStats } from "@/lib/seo/salonStats";
import { getOverride, type IndexDirective } from "@/lib/seo/seoOverrides";

/** Category slugs that get programmatic SEO pages ("other" is intentionally excluded). */
export const SEO_CATEGORY_SLUGS: CategorySlug[] = [...VALID_CATEGORY_SLUGS]
  .filter((s): s is CategorySlug => s !== "other")
  .sort();

/** A mapped service's `category` may be a slug ("hair") or a platform label ("Kosa"). */
function resolveCategorySlug(cat: string): CategorySlug | undefined {
  if (!cat) return undefined;
  if (VALID_CATEGORY_SLUGS.has(cat)) return cat as CategorySlug;
  return CANONICAL_TO_SLUG[cat];
}

/** True when the salon offers `slug` AND exposes at least one useful signal. */
export function passesContentThreshold(
  salon: MappedSalon,
  slug: CategorySlug,
): boolean {
  const inCat = salon.services.filter(
    (s) => resolveCategorySlug(s.category) === slug,
  );
  if (inCat.length === 0) return false; // doesn't offer the category at all
  const hasPrice = inCat.some((s) => s.price > 0);
  const hasSlot = salon.nextSlots.length > 0;
  const validCard = Boolean(salon.name && salon.city);
  return hasPrice || hasSlot || validCard;
}

async function enrichWithServices(p: PlatformSalon): Promise<PlatformSalon> {
  const id = p.id ?? p._id ?? "";
  if (!id) return p;
  try {
    const services = await fetchSearchSalonServices(id);
    return services.length > 0 ? { ...p, services } : p;
  } catch {
    return p;
  }
}

async function loadSalons(params: {
  city?: string;
  limit?: number;
}): Promise<MappedSalon[]> {
  const profiles = await fetchSearchSalonProfiles(params);
  const enriched = await Promise.all(profiles.map(enrichWithServices));
  return enriched.map(mapSalon);
}

// ── SSR page data (Faza 2) ──────────────────────────────────────────────────

/** Serializable salon card for server-rendered SEO content. */
export interface SalonCardData {
  slug: string;
  name: string;
  city?: string;
  /** Lowest price (RSD) — overall, or within a category when one is given. */
  minPrice: number | null;
  hasVariants: boolean;
  nextSlotCount: number;
  /** Rating fields — present only after stats enrichment; undefined = not fetched. */
  rating?: number | null;
  reviewCount?: number;
}

function toSalonCard(salon: MappedSalon, slug?: CategorySlug): SalonCardData {
  const services = slug
    ? salon.services.filter((s) => resolveCategorySlug(s.category) === slug)
    : salon.services;
  const prices = services.map((s) => s.price).filter((p) => p > 0);
  return {
    slug: salon.slug ?? "",
    name: salon.name,
    city: salon.city,
    minPrice: prices.length > 0 ? Math.min(...prices) : null,
    hasVariants: services.some((s) => s.hasVariants),
    nextSlotCount: salon.nextSlots.length,
  };
}

/** Sort: more upcoming slots first, then cheaper. */
function bySlotsThenPrice(a: SalonCardData, b: SalonCardData): number {
  return (
    b.nextSlotCount - a.nextSlotCount ||
    (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity)
  );
}

/** Attaches rating/reviewCount (cached salon-stats) to the given cards by tenantId. */
async function attachRatings(
  cards: SalonCardData[],
  tenantBySlug: Map<string, string>,
): Promise<SalonCardData[]> {
  return Promise.all(
    cards.map(async (card) => {
      const tenantId = tenantBySlug.get(card.slug);
      if (!tenantId) return card;
      const stats = await fetchSalonStats(tenantId);
      if (!stats) return card;
      return {
        ...card,
        rating: stats.averageRating,
        reviewCount: stats.reviewCount,
      };
    }),
  );
}

/** Map of card slug → tenantId, for stats enrichment. */
function tenantBySlugMap(salons: MappedSalon[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of salons) {
    if (s.slug && s.tenantId) m.set(s.slug, s.tenantId);
  }
  return m;
}

/** How many cards to enrich with ratings (matches the display cap). */
const RATING_ENRICH_LIMIT = 12;

export interface CityCategoryLink {
  slug: CategorySlug;
  urlSlug: string;
  count: number;
}

/** SEO categories that have ≥1 qualifying salon in the given salon set. */
function availableCategories(salons: MappedSalon[]): CityCategoryLink[] {
  return SEO_CATEGORY_SLUGS.map((slug) => ({
    slug,
    urlSlug: categoryToUrlSlug(slug),
    count: salons.filter((s) => passesContentThreshold(s, slug)).length,
  }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
}

export interface LaterSlot {
  salonName: string;
  salonSlug: string;
  time: string; // "HH:MM"
  date: string; // "YYYY-MM-DD"
  when: "today" | "tomorrow";
}

/**
 * "Kasniji termini" — if it's morning, this afternoon's slots; if afternoon,
 * tomorrow's. Times come straight from the ISO string (platform-local), matching
 * how the rest of the app reads slot times.
 */
function buildLaterSlots(salons: MappedSalon[]): LaterSlot[] {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Belgrade",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
  const isMorning = hour < 12;
  const targetDate = isMorning ? todayInBelgrade() : tomorrowInBelgrade();
  const minHour = isMorning ? 14 : 0;

  const out: LaterSlot[] = [];
  for (const s of salons) {
    if (!s.slug) continue;
    for (const slot of s.nextSlots) {
      const date = slot.startTime.slice(0, 10);
      const hh = Number(slot.startTime.slice(11, 13));
      if (date === targetDate && hh >= minHour) {
        out.push({
          salonName: s.name,
          salonSlug: s.slug,
          time: slot.startTime.slice(11, 16),
          date,
          when: isMorning ? "today" : "tomorrow",
        });
      }
    }
  }
  out.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  return out.slice(0, 5);
}

export interface CategoryPageData {
  indexable: boolean;
  salonCount: number;
  minPrice: number | null;
  slotCount: number;
  salons: SalonCardData[];
  /** Other categories available in the city (excludes the current one). */
  relatedCategories: CityCategoryLink[];
  /** City salons not already shown for this category. */
  moreSalons: SalonCardData[];
  laterSlots: LaterSlot[];
}

/** Server data for a /[city]/[categorySlug] page — salon cards + discovery modules. `cityName` null = all cities. */
export async function getCategoryPageData(
  cityName: string | null,
  slug: CategorySlug,
): Promise<CategoryPageData> {
  const salons = await loadSalons(cityName ? { city: cityName } : { limit: 200 });
  const passing = salons.filter((s) => passesContentThreshold(s, slug));
  const cards = passing
    .map((s) => toSalonCard(s, slug))
    .filter((c) => c.slug)
    .sort(bySlotsThenPrice);
  const prices = cards
    .map((c) => c.minPrice)
    .filter((p): p is number => p != null);

  const shown = new Set(cards.map((c) => c.slug));
  const moreSalons = salons
    .filter(
      (s) =>
        SEO_CATEGORY_SLUGS.some((sl) => passesContentThreshold(s, sl)) &&
        !shown.has(s.slug ?? ""),
    )
    .map((s) => toSalonCard(s))
    .filter((c) => c.slug)
    .sort(bySlotsThenPrice)
    .slice(0, 5);

  const tenantBySlug = tenantBySlugMap(salons);
  const [enrichedSalons, enrichedMoreSalons] = await Promise.all([
    attachRatings(cards.slice(0, RATING_ENRICH_LIMIT), tenantBySlug),
    attachRatings(moreSalons, tenantBySlug),
  ]);

  return {
    indexable: cards.length > 0,
    salonCount: cards.length,
    minPrice: prices.length > 0 ? Math.min(...prices) : null,
    slotCount: passing.reduce((acc, s) => acc + s.nextSlots.length, 0),
    salons: enrichedSalons,
    relatedCategories: availableCategories(salons).filter((c) => c.slug !== slug),
    moreSalons: enrichedMoreSalons,
    laterSlots: buildLaterSlots(passing),
  };
}

export interface CityPageData {
  indexable: boolean;
  salonCount: number;
  salons: SalonCardData[];
  categories: CityCategoryLink[];
}

/** Server data for a /[city] hub page — top salons + available categories. */
export async function getCityPageData(
  cityName: string,
): Promise<CityPageData> {
  const salons = await loadSalons({ city: cityName });

  const usable = salons.filter((s) =>
    SEO_CATEGORY_SLUGS.some((slug) => passesContentThreshold(s, slug)),
  );
  const cards = usable
    .map((s) => toSalonCard(s))
    .filter((c) => c.slug)
    .sort(bySlotsThenPrice);

  const enrichedSalons = await attachRatings(
    cards.slice(0, RATING_ENRICH_LIMIT),
    tenantBySlugMap(salons),
  );

  return {
    indexable: cards.length > 0,
    salonCount: cards.length,
    salons: enrichedSalons,
    categories: availableCategories(salons),
  };
}

export interface CategoryIndexability {
  /** Automatic threshold result, before manual override. */
  indexable: boolean;
  /** Final directive used by robots/sitemap (override wins). */
  directive: IndexDirective;
  /** Salons offering this category that pass the threshold. */
  salonCount: number;
  hasPrice: boolean;
  hasSlot: boolean;
}

/** Single-page indexability — used by `generateMetadata`. `cityName` null = all cities. */
export async function getCategoryIndexability(
  cityName: string | null,
  slug: CategorySlug,
): Promise<CategoryIndexability> {
  const salons = await loadSalons(cityName ? { city: cityName } : { limit: 200 });
  const passing = salons.filter((s) => passesContentThreshold(s, slug));
  const indexable = passing.length > 0;
  const citySlug = cityName ? cityToSlug(cityName) : ALL_CITIES_SLUG;
  const path = `/${citySlug}/${categoryToUrlSlug(slug)}`;
  const directive: IndexDirective =
    getOverride(path) ?? (indexable ? "index" : "noindex");
  return {
    indexable,
    directive,
    salonCount: passing.length,
    hasPrice: passing.some((s) =>
      s.services.some(
        (sv) => resolveCategorySlug(sv.category) === slug && sv.price > 0,
      ),
    ),
    hasSlot: passing.some((s) => s.nextSlots.length > 0),
  };
}

export interface CityIndexability {
  indexable: boolean;
  directive: IndexDirective;
  salonCount: number;
}

/** City hub indexability — indexable when the city has ≥1 salon offering any SEO category. */
export async function getCityIndexability(
  cityName: string,
): Promise<CityIndexability> {
  const salons = await loadSalons({ city: cityName });
  const usable = salons.filter((s) =>
    SEO_CATEGORY_SLUGS.some((slug) => passesContentThreshold(s, slug)),
  );
  const indexable = usable.length > 0;
  const path = `/${cityToSlug(cityName)}`;
  const directive: IndexDirective =
    getOverride(path) ?? (indexable ? "index" : "noindex");
  return { indexable, directive, salonCount: usable.length };
}

export interface IndexableCombo {
  citySlug: string;
  /** Internal category slug ("hair"). */
  categorySlug: CategorySlug;
  /** Public Serbian URL slug ("frizura") used to build the path. */
  urlSlug: string;
  cityName: string;
}

/** Bulk indexable (city × category) combos — used by sitemap. One salon fetch, grouped by city. */
export async function getIndexableCombos(): Promise<IndexableCombo[]> {
  const salons = await loadSalons({ limit: 200 });

  const byCity = new Map<string, MappedSalon[]>();
  for (const s of salons) {
    const city = canonicalCity(s.city);
    if (!city) continue;
    const bucket = byCity.get(city);
    if (bucket) bucket.push(s);
    else byCity.set(city, [s]);
  }

  const combos: IndexableCombo[] = [];
  for (const [cityName, citySalons] of byCity) {
    const citySlug = cityToSlug(cityName);
    for (const slug of SEO_CATEGORY_SLUGS) {
      const passes = citySalons.some((s) => passesContentThreshold(s, slug));
      if (!passes) continue;
      const urlSlug = categoryToUrlSlug(slug);
      if (getOverride(`/${citySlug}/${urlSlug}`) === "noindex") continue;
      combos.push({ citySlug, categorySlug: slug, urlSlug, cityName });
    }
  }
  return combos;
}

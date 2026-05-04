// src/lib/search/findBestSlots
/**
 * 6-level fallback search engine.
 * NEVER returns empty if there are any salons with working hours.
 *
 * Level 1 — exact: city + category + date + time window
 * Level 2 — relax time: city + category + date (any time)
 * Level 3 — relax category: city + related categories + date
 * Level 4 — relax date: city + any category + nearest future (next 14 days)
 * Level 5 — relax city: nearby cities within 200 km
 * Level 6 — synthetic: generate from working hours (last resort)
 */

import type { PlatformSalon, PlatformService } from "@/lib/api/platformClient";
import { normalizeCategory } from "@/lib/slots/normalize";
import {
  CANONICAL_TO_SLUG,
  SLUG_TO_CANONICAL,
  type CategorySlug,
} from "@/lib/intent/categoryMap";
import { stripDiacritics } from "@/lib/intent/parseIntent";
import { haversineKm } from "@/lib/cities";
import { generateSlotsFromWorkingHours } from "@/lib/slots/generateSlots";
import type { MappedSalon } from "@/lib/mappers/salonMapper";
import type { NormalizedSearch } from "./normalizeSearch";
import type { SearchResult } from "@/types/slots";
import { todayInBelgrade, tomorrowInBelgrade } from "./normalizeSearch";

// ── Related category map ──────────────────────────────────────────────────────

const RELATED: Partial<Record<CategorySlug, CategorySlug[]>> = {
  massage: ["facial", "waxing"],
  facial: ["massage", "eyebrows", "waxing"],
  eyebrows: ["facial", "makeup"],
  makeup: ["hair", "eyebrows"],
  waxing: ["facial", "massage"],
  hair: [],
  nails: [],
  other: ["massage", "facial"],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimeLabel(iso: string): string {
  return iso.slice(11, 16);
}

const MONTHS_SR = [
  "jan", "feb", "mar", "apr", "maj", "jun",
  "jul", "avg", "sep", "okt", "nov", "dec",
];
const DAYS_SR = ["Ned", "Pon", "Uto", "Sre", "Čet", "Pet", "Sub"];

function formatDateLabel(iso: string, today: string, tomorrow: string): string {
  const dateStr = iso.slice(0, 10);
  if (dateStr === today) return "Danas";
  if (dateStr === tomorrow) return "Sutra";
  const [y, mo, dd] = dateStr.split("-").map(Number);
  const d = new Date(y, mo - 1, dd);
  return `${DAYS_SR[d.getDay()]}, ${dd}. ${MONTHS_SR[d.getMonth()]}`;
}

/**
 * Resolves a platform service to a category slug.
 * Handles: canonical Serbian label ("Depilacija"), slug ("waxing"), or service name fallback.
 */
function resolveServiceCategory(svc: PlatformService | undefined): CategorySlug {
  if (!svc) return "other";
  const rawCat = svc.category ?? "";
  if (rawCat) {
    // Try canonical label → slug ("Depilacija" → "waxing")
    const fromCanonical = CANONICAL_TO_SLUG[rawCat];
    if (fromCanonical) return fromCanonical;
    // Try slug directly ("waxing" → "waxing")
    if (rawCat in SLUG_TO_CANONICAL) return rawCat as CategorySlug;
  }
  // Fall back to service name analysis
  return normalizeCategory(svc.name);
}

function matchesSubcategory(
  serviceName: string,
  salon: PlatformSalon,
  subNorm: string,
  serviceId: string | null,
): boolean {
  if (serviceId != null) {
    return stripDiacritics(serviceName).includes(subNorm);
  }
  return (salon.services ?? []).some((sv) =>
    stripDiacritics(sv.name).includes(subNorm),
  );
}

function computeRelevance(
  slot: { startTime: string },
  _svc: PlatformService | undefined,
  salon: PlatformSalon,
  params: NormalizedSearch,
  fallbackLevel: number,
  distanceKm: number | undefined,
): number {
  let score = 1000 - fallbackLevel * 100;

  // Use Belgrade-aware hour
  const slotHour = new Date(slot.startTime).getHours();

  if (params.requestedHour !== undefined) {
    const diff = Math.abs(slotHour - params.requestedHour);
    if (diff === 0) score += 100;
    else if (diff <= 1) score += 60;
    else score -= diff * 10;
  }

  if (distanceKm !== undefined) score -= Math.min(distanceKm * 2, 200);
  if (salon.verified) score += 50;
  if (typeof salon.rating === "number") score += salon.rating * 5;

  // Prefer earlier slots
  const daysOut =
    (new Date(slot.startTime).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  score -= Math.max(0, daysOut) * 3;

  return Math.round(score);
}

// ── Candidate building ────────────────────────────────────────────────────────

interface SlotCandidate {
  salon: PlatformSalon;
  startTime: string;
  endTime: string;
  serviceId: string | null;
  service?: PlatformService;
  category: CategorySlug;
  serviceName: string;
  isSynthetic: boolean;
}

function makeCandidates(
  salons: PlatformSalon[],
  useSynthetic = false,
): SlotCandidate[] {
  const candidates: SlotCandidate[] = [];

  for (const salon of salons) {
    const salonId = salon.id ?? salon._id ?? "";

    // Real slots from nextSlots
    for (const s of salon.nextSlots ?? []) {
      const svc = (salon.services ?? []).find(
        (sv) => (sv.id ?? sv._id) === s.serviceId,
      );
      const category = resolveServiceCategory(svc);
      const svcRaw = svc as Record<string, unknown> | undefined;
      const svcVars = Array.isArray(svcRaw?.variants)
        ? (svcRaw!.variants as { duration?: number }[])
        : [];
      const variantDurs = svcVars.map((v) => v.duration ?? 0).filter((d) => d > 0);
      const duration =
        svcRaw?.type === "variant" && variantDurs.length > 0
          ? Math.min(...variantDurs)
          : (svc?.duration ?? 60);
      const endMs = new Date(s.startTime).getTime() + duration * 60_000;

      candidates.push({
        salon,
        startTime: s.startTime,
        endTime: new Date(endMs).toISOString(),
        serviceId: s.serviceId,
        service: svc,
        category,
        serviceName: svc?.name ?? "Slobodan termin",
        isSynthetic: false,
      });
    }

    // Synthetic slots generated from working hours (last resort)
    if (useSynthetic && salon.workingHours) {
      const services = salon.services ?? [];
      // Use all services if salon has them; otherwise generate one generic batch
      const targetServices = services.length > 0 ? services : [undefined];

      for (const svc of targetServices) {
        // Skip if real slots already cover this service
        const hasRealSlots =
          svc != null &&
          (salon.nextSlots ?? []).some((s) => s.serviceId === (svc.id ?? svc._id));
        if (hasRealSlots) continue;

        const mapped: MappedSalon = {
          id: salonId,
          name: salon.name,
          city: salon.city,
          location: { lat: salon.lat, lng: salon.lng, city: salon.city },
          services: services.map((sv) => {
            const r = sv as Record<string, unknown>;
            const isVariant = r.type === "variant";
            const isGroup = r.type === "group";
            const variants = Array.isArray(r.variants) ? (r.variants as { price?: number; duration?: number }[]) : [];
            const groupSvs = Array.isArray(r.services) ? (r.services as { price?: number }[]) : [];
            const variantPrices = variants.map((v) => v.price ?? 0).filter((p) => p > 0);
            const groupPrices = groupSvs.map((v) => v.price ?? 0).filter((p) => p > 0);
            const durations = variants.map((v) => v.duration ?? 0).filter((d) => d > 0);
            let price: number;
            if (isVariant && variantPrices.length > 0) price = Math.min(...variantPrices);
            else if (isGroup && groupPrices.length > 0) price = Math.min(...groupPrices);
            else price = (sv.basePrice ?? sv.price ?? 0) as number;
            return {
              id: (sv.id ?? sv._id ?? "") as string,
              rawId: (sv._id ?? sv.id ?? "") as string,
              name: sv.name,
              category: ((r.categorySlug ?? sv.category) ?? "") as string,
              duration: isVariant && durations.length > 0 ? Math.min(...durations) : (sv.duration ?? 60),
              price,
              hasVariants: (isVariant && variants.length > 0) || (isGroup && groupSvs.length > 0),
            };
          }),
          nextAvailableSlot: null,
          nextSlots: [],
          workingHours: (salon.workingHours ?? {}) as Record<string, string>,
        };

        const svcR = svc as Record<string, unknown> | undefined;
        const svcVariants = Array.isArray(svcR?.variants)
          ? (svcR!.variants as { duration?: number }[])
          : [];
        const variantDurations = svcVariants.map((v) => v.duration ?? 0).filter((d) => d > 0);
        const duration =
          svcR?.type === "variant" && variantDurations.length > 0
            ? Math.min(...variantDurations)
            : (svc?.duration ?? 60);
        const generated = generateSlotsFromWorkingHours(mapped, {
          serviceDuration: duration,
        });

        const category = resolveServiceCategory(svc);
        const serviceId = svc ? (svc.id ?? svc._id ?? null) : null;
        const serviceName = svc?.name ?? "Slobodan termin";

        for (const g of generated) {
          candidates.push({
            salon,
            startTime: g.startTime,
            endTime: g.endTime,
            serviceId,
            service: svc,
            category,
            serviceName,
            isSynthetic: true,
          });
        }
      }
    }
  }

  return candidates;
}

function resolveServicePrice(svc: PlatformService | undefined): number | undefined {
  if (!svc) return undefined;
  const r = svc as Record<string, unknown>;
  if (r.type === "variant" && Array.isArray(r.variants) && r.variants.length > 0) {
    const prices = (r.variants as { price?: number }[])
      .map((v) => v.price ?? 0)
      .filter((p) => p > 0);
    return prices.length > 0 ? Math.min(...prices) : undefined;
  }
  if (r.type === "group" && Array.isArray(r.services) && r.services.length > 0) {
    const prices = (r.services as { price?: number }[])
      .map((sv) => sv.price ?? 0)
      .filter((p) => p > 0);
    return prices.length > 0 ? Math.min(...prices) : undefined;
  }
  const p = svc.basePrice ?? svc.price;
  return typeof p === "number" && p > 0 ? p : undefined;
}

function resolveHasVariants(svc: PlatformService | undefined): boolean {
  if (!svc) return false;
  const r = svc as Record<string, unknown>;
  if (r.type === "variant") return Array.isArray(r.variants) && (r.variants as unknown[]).length > 0;
  if (r.type === "group") return Array.isArray(r.services) && (r.services as unknown[]).length > 0;
  return false;
}

function toSearchResult(
  c: SlotCandidate,
  params: NormalizedSearch,
  fallbackLevel: number,
  today: string,
  tomorrow: string,
): SearchResult {
  const salonId = c.salon.id ?? c.salon._id ?? "";

  let distanceKm: number | undefined;
  if (
    params.lat != null &&
    params.lng != null &&
    c.salon.lat != null &&
    c.salon.lng != null
  ) {
    distanceKm = haversineKm(params.lat, params.lng, c.salon.lat, c.salon.lng);
  } else if (params.cityRef && c.salon.lat != null && c.salon.lng != null) {
    distanceKm = haversineKm(
      params.cityRef.lat,
      params.cityRef.lng,
      c.salon.lat,
      c.salon.lng,
    );
  } else if (typeof c.salon.distance === "number") {
    distanceKm = c.salon.distance ?? undefined;
  }

  const relevanceScore = computeRelevance(
    { startTime: c.startTime },
    c.service,
    c.salon,
    params,
    fallbackLevel,
    distanceKm,
  );

  return {
    // FlatSlot
    salonId,
    salonName: c.salon.name,
    serviceId: c.serviceId,
    serviceName: c.serviceName,
    category: c.category,
    startTime: c.startTime,
    city: c.salon.city ?? "",
    distanceKm:
      distanceKm != null ? Math.round(distanceKm * 10) / 10 : undefined,
    price: resolveServicePrice(c.service),
    hasVariants: resolveHasVariants(c.service),
    // SearchResult extras
    salonSlug: c.salon.slug,
    salonLogo: c.salon.logo,
    verified: c.salon.verified as boolean | undefined,
    rating: c.salon.rating as number | undefined,
    website: c.salon.website as string | undefined,
    googleBusinessUrl: c.salon.googleBusinessUrl as string | undefined,
    serviceDuration: c.service?.duration ?? 60,
    endTime: c.endTime,
    dateLabel: formatDateLabel(c.startTime, today, tomorrow),
    timeLabel: formatTimeLabel(c.startTime),
    relevanceScore,
    fallbackLevel,
    isSynthetic: c.isSynthetic,
  };
}

// ── Level filters ─────────────────────────────────────────────────────────────

function filterCandidates(
  candidates: SlotCandidate[],
  params: NormalizedSearch,
  opts: {
    requireCity?: boolean;
    requireCategory?: boolean;
    requireDate?: boolean;
    requireTimeWindow?: boolean;
    allowRelatedCategories?: boolean;
    maxDistanceKm?: number;
  },
): SlotCandidate[] {
  return candidates.filter((c) => {
    // City filter
    if (opts.requireCity !== false) {
      const salonCityNorm = stripDiacritics(c.salon.city ?? "");
      const targetNorm = stripDiacritics(params.cityDisplay);
      if (salonCityNorm !== targetNorm) return false;
    } else if (opts.maxDistanceKm != null && params.cityRef) {
      const d =
        c.salon.lat != null && c.salon.lng != null
          ? haversineKm(
              params.cityRef.lat,
              params.cityRef.lng,
              c.salon.lat,
              c.salon.lng,
            )
          : Infinity;
      if (d > opts.maxDistanceKm) return false;
    }

    // Category filter
    if (opts.requireCategory !== false && params.category) {
      const allowed: CategorySlug[] = [params.category];
      if (opts.allowRelatedCategories) {
        const rel = RELATED[params.category] ?? [];
        allowed.push(...rel);
      }
      if (!allowed.includes(c.category)) return false;
    }

    // Date filter
    if (opts.requireDate !== false && params.date) {
      const slotDate = c.startTime.slice(0, 10);
      if (slotDate !== params.date) return false;
    }

    // Time window filter
    if (
      opts.requireTimeWindow &&
      params.timeWindowStart != null &&
      params.timeWindowEnd != null
    ) {
      const slotHour = new Date(c.startTime).getHours();
      if (slotHour < params.timeWindowStart || slotHour > params.timeWindowEnd)
        return false;
    }

    // Subcategory filter
    if (params.subcategoryNorm) {
      if (
        !matchesSubcategory(
          c.serviceName,
          c.salon,
          params.subcategoryNorm,
          c.serviceId,
        )
      ) {
        return false;
      }
    }

    // Skip past slots
    if (new Date(c.startTime).getTime() <= Date.now()) return false;

    return true;
  });
}

// ── Diversity helper ──────────────────────────────────────────────────────────

/**
 * Picks up to `maxCount` slots, capping each salon at `maxPerSalon`.
 * Input should already be sorted by relevance descending.
 */
export function pickDiverseSlots(
  slots: SearchResult[],
  maxCount = 5,
  maxPerSalon = 2,
): SearchResult[] {
  const salonCounts = new Map<string, number>();
  const result: SearchResult[] = [];
  for (const s of slots) {
    const n = salonCounts.get(s.salonId) ?? 0;
    if (n >= maxPerSalon) continue;
    salonCounts.set(s.salonId, n + 1);
    result.push(s);
    if (result.length >= maxCount) break;
  }
  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface FindSlotsResult {
  results: SearchResult[];
  fallbackLevel: number;
  fallbackLabel: string;
}

export function findBestSlots(
  salons: PlatformSalon[],
  params: NormalizedSearch,
  opts: { augmentWithSynthetic?: boolean } = {},
): FindSlotsResult {
  const today = todayInBelgrade();
  const tomorrow = tomorrowInBelgrade();
  const limit = params.limit;

  const allCandidates = makeCandidates(salons, false);

  function toResults(filtered: SlotCandidate[], level: number): SearchResult[] {
    return filtered
      .map((c) => toSearchResult(c, params, level, today, tomorrow))
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
  }

  console.log("[findBestSlots] candidates:", allCandidates.length, "city:", params.cityDisplay, "category:", params.category ?? "any");

  // ── Level 1: exact city + category + date + time window ────────────────────
  if (params.category && params.timeWindowStart != null) {
    const l1 = filterCandidates(allCandidates, params, {
      requireCity: true,
      requireCategory: true,
      requireDate: true,
      requireTimeWindow: true,
    });
    if (l1.length > 0) {
      console.log("[findBestSlots] L1 exact:", l1.length);
      return { results: toResults(l1, 1), fallbackLevel: 1, fallbackLabel: "exact" };
    }
  }

  // ── Level 2: city + category + date (any time) ────────────────────────────
  if (params.category) {
    const l2 = filterCandidates(allCandidates, params, {
      requireCity: true,
      requireCategory: true,
      requireDate: true,
      requireTimeWindow: false,
    });

    if (l2.length > 0) {
      let sorted = l2;
      if (params.requestedHour != null) {
        sorted = [...l2].sort((a, b) => {
          const da = Math.abs(new Date(a.startTime).getHours() - params.requestedHour!);
          const db = Math.abs(new Date(b.startTime).getHours() - params.requestedHour!);
          return da - db;
        });
      }
      console.log("[findBestSlots] L2 relaxed-time:", l2.length);
      return { results: toResults(sorted, 2), fallbackLevel: 2, fallbackLabel: "relaxed-time" };
    }
  }

  // ── Level 3: city + related categories + date ─────────────────────────────
  if (params.category) {
    const l3 = filterCandidates(allCandidates, params, {
      requireCity: true,
      requireCategory: true,
      requireDate: true,
      requireTimeWindow: false,
      allowRelatedCategories: true,
    });
    if (l3.length > 0) {
      console.log("[findBestSlots] L3 related-categories:", l3.length);
      return { results: toResults(l3, 3), fallbackLevel: 3, fallbackLabel: "related-categories" };
    }
  }

  // ── Level 4: city + any category + nearest future slots ───────────────────
  const l4 = filterCandidates(allCandidates, params, {
    requireCity: true,
    requireCategory: false,
    requireDate: false,
    requireTimeWindow: false,
  });
  if (l4.length > 0) {
    console.log("[findBestSlots] L4 nearest-future:", l4.length);
    return { results: toResults(l4, 4), fallbackLevel: 4, fallbackLabel: "nearest-future" };
  }

  // ── Level 5: nearby cities (within 200 km) ────────────────────────────────
  // When augmentWithSynthetic is set (national supplement call), use real+synthetic
  // candidates so cities with few real nextSlots still contribute 5 slots.
  const l5Pool = opts.augmentWithSynthetic
    ? makeCandidates(salons, true)
    : allCandidates;
  const l5 = filterCandidates(l5Pool, params, {
    requireCity: false,
    requireCategory: false,
    requireDate: false,
    requireTimeWindow: false,
    maxDistanceKm: 200,
  });
  if (l5.length > 0) {
    console.log("[findBestSlots] L5 nearby-cities:", l5.length, opts.augmentWithSynthetic ? "(+synthetic)" : "");
    return { results: toResults(l5, 5), fallbackLevel: 5, fallbackLabel: "nearby-cities" };
  }

  // ── Level 6: last resort — generate synthetic slots from working hours ─────
  const withSynthetic = makeCandidates(salons, true);
  if (withSynthetic.length > 0) {
    const l6 = filterCandidates(withSynthetic, params, {
      requireCity: false,
      requireCategory: false,
      requireDate: false,
      requireTimeWindow: false,
    });
    if (l6.length > 0) {
      console.log("[findBestSlots] L6 synthetic:", l6.length);
      return { results: toResults(l6, 6), fallbackLevel: 6, fallbackLabel: "synthetic" };
    }
  }

  console.log("[findBestSlots] no-salons");
  return { results: [], fallbackLevel: 0, fallbackLabel: "no-salons" };
}

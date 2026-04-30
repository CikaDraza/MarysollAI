// src/lib/search/findBestSlots
/**
 * 5-level fallback search engine.
 * NEVER returns empty if there are any salons with working hours.
 *
 * Level 1 — exact: city + category + date + time window
 * Level 2 — relax time: city + category + date (any time)
 * Level 3 — relax category: city + related categories + date
 * Level 4 — relax date: city + category + nearest future slots (next 14 days)
 * Level 5 — relax city: nearest cities within 200 km
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
  try {
    return new Date(iso).toLocaleTimeString("sr-Latn", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Belgrade",
    });
  } catch {
    return iso.slice(11, 16);
  }
}

const MONTHS_SR = [
  "jan",
  "feb",
  "mar",
  "apr",
  "maj",
  "jun",
  "jul",
  "avg",
  "sep",
  "okt",
  "nov",
  "dec",
];
const DAYS_SR = ["Ned", "Pon", "Uto", "Sre", "Čet", "Pet", "Sub"];

function formatDateLabel(iso: string, today: string, tomorrow: string): string {
  const dateStr = iso.slice(0, 10);
  if (dateStr === today) return "Danas";
  if (dateStr === tomorrow) return "Sutra";
  const d = new Date(iso);
  return `${DAYS_SR[d.getDay()]}, ${d.getDate()}. ${MONTHS_SR[d.getMonth()]}`;
}

function resolveServiceCategory(
  svc: PlatformService | undefined,
): CategorySlug {
  if (!svc) return "other";
  const rawCat = svc.category ?? "";
  if (rawCat) {
    const fromCanonical = CANONICAL_TO_SLUG[rawCat];
    if (fromCanonical) return fromCanonical;
  }
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
  // Generic slot — match against any salon service
  return (salon.services ?? []).some((sv) =>
    stripDiacritics(sv.name).includes(subNorm),
  );
}

function computeRelevance(
  slot: { startTime: string },
  svc: PlatformService | undefined,
  salon: PlatformSalon,
  params: NormalizedSearch,
  fallbackLevel: number,
  distanceKm: number | undefined,
): number {
  let score = 1000 - fallbackLevel * 100;

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
      const duration = svc?.duration ?? 60;
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
    if (
      useSynthetic &&
      (salon.nextSlots ?? []).length === 0 &&
      salon.workingHours
    ) {
      const mapped: MappedSalon = {
        id: salonId,
        name: salon.name,
        city: salon.city,
        location: { lat: salon.lat, lng: salon.lng, city: salon.city },
        services: (salon.services ?? []).map((sv) => ({
          id: sv.id ?? sv._id ?? "",
          name: sv.name,
          category: sv.category ?? "",
          duration: sv.duration ?? 60,
          price: sv.basePrice ?? sv.price ?? 0,
        })),
        nextAvailableSlot: null,
        nextSlots: [],
        workingHours: (salon.workingHours ?? {}) as Record<string, string>,
      };

      const generated = generateSlotsFromWorkingHours(mapped);
      for (const g of generated) {
        // Pick first matching service for this salon if category filtered
        const matchingSvc = (salon.services ?? [])[0];
        const category = resolveServiceCategory(matchingSvc);
        const duration = matchingSvc?.duration ?? 60;
        candidates.push({
          salon,
          startTime: g.startTime,
          endTime: g.endTime,
          serviceId: matchingSvc
            ? (matchingSvc.id ?? matchingSvc._id ?? null)
            : null,
          service: matchingSvc,
          category,
          serviceName: matchingSvc?.name ?? "Slobodan termin",
          isSynthetic: true,
        });
      }
    }
  }

  return candidates;
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
    price: c.service?.basePrice ?? c.service?.price ?? undefined,
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

// ── Public API ────────────────────────────────────────────────────────────────

export interface FindSlotsResult {
  results: SearchResult[];
  fallbackLevel: number;
  fallbackLabel: string;
}

export function findBestSlots(
  salons: PlatformSalon[],
  params: NormalizedSearch,
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

  // ── Level 1: exact city + category + date + time window ────────────────────
  if (params.category && params.timeWindowStart != null) {
    const l1 = filterCandidates(allCandidates, params, {
      requireCity: true,
      requireCategory: true,
      requireDate: true,
      requireTimeWindow: true,
    });
    if (l1.length > 0)
      return {
        results: toResults(l1, 1),
        fallbackLevel: 1,
        fallbackLabel: "exact",
      };
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
      // Apply soft time preference: sort by proximity to requested time
      let sorted = l2;
      if (params.requestedHour != null) {
        sorted = [...l2].sort((a, b) => {
          const da = Math.abs(
            new Date(a.startTime).getHours() - params.requestedHour!,
          );
          const db = Math.abs(
            new Date(b.startTime).getHours() - params.requestedHour!,
          );
          return da - db;
        });
      }
      return {
        results: toResults(sorted, 2),
        fallbackLevel: 2,
        fallbackLabel: "relaxed-time",
      };
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
    if (l3.length > 0)
      return {
        results: toResults(l3, 3),
        fallbackLevel: 3,
        fallbackLabel: "related-categories",
      };
  }

  // ── Level 4: city + any category + nearest future slots ───────────────────
  const l4 = filterCandidates(allCandidates, params, {
    requireCity: true,
    requireCategory: false,
    requireDate: false,
    requireTimeWindow: false,
  });
  if (l4.length > 0)
    return {
      results: toResults(l4, 4),
      fallbackLevel: 4,
      fallbackLabel: "nearest-future",
    };

  // ── Level 5: nearby cities (within 200 km) ────────────────────────────────
  const l5 = filterCandidates(allCandidates, params, {
    requireCity: false,
    requireCategory: false,
    requireDate: false,
    requireTimeWindow: false,
    maxDistanceKm: 200,
  });
  if (l5.length > 0)
    return {
      results: toResults(l5, 5),
      fallbackLevel: 5,
      fallbackLabel: "nearby-cities",
    };

  // ── Level 6: last resort — generate synthetic slots from working hours ─────
  const withSynthetic = makeCandidates(salons, true);
  if (withSynthetic.length > 0) {
    const l6 = filterCandidates(withSynthetic, params, {
      requireCity: false,
      requireCategory: false,
      requireDate: false,
      requireTimeWindow: false,
    });
    if (l6.length > 0)
      return {
        results: toResults(l6, 6),
        fallbackLevel: 6,
        fallbackLabel: "synthetic",
      };
  }

  return { results: [], fallbackLevel: 0, fallbackLabel: "no-salons" };
}

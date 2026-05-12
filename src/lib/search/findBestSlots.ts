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
import {
  generateSlotsFromWorkingHours,
  SYNTHETIC_GLOBAL_CAP,
  SYNTHETIC_MAX_TOTAL_PER_CALL,
} from "@/lib/slots/generateSlots";
import type { MappedSalon } from "@/lib/mappers/salonMapper";
import type { NormalizedSearch } from "./normalizeSearch";
import type { SearchResult } from "@/types/slots";
import { todayInBelgrade, tomorrowInBelgrade } from "./normalizeSearch";
import {
  getAvailabilityConfidenceScore,
  getAvailabilityType,
  type AvailabilityConfidence,
} from "@/lib/availability/availabilityConfidence";
import {
  generateVerifiedSlots,
  type Appointment as AvailabilityAppointment,
  type WorkingHours,
} from "@/lib/availability/generateVerifiedSlots";

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
  // Phase 2 — slot origin tagging
  availabilityConfidence: AvailabilityConfidence;
  slotOrigins: ("real" | "synthetic" | "nearby_city" | "relaxed_time" | "related_service")[];
}

// Mutable accumulator for synthetic generation debug info — passed by reference
// into makeCandidates so debug stats aggregate across all salon/service iterations.
interface SyntheticDebugAccum {
  generated: number;
  accepted: number;
  rejectedByFeasibility: number;
  capHit: boolean;
}

interface MakeCandidatesOpts {
  /** Injected wall clock — passed into generateSlotsFromWorkingHours. */
  now?: Date;
  userLat?: number;
  userLng?: number;
  /** User's city display name — used to compute per-salon cityMatch. */
  preferredCity?: string;
  /** Global cap across all salons in this call. */
  maxSyntheticTotal?: number;
  /** Accumulator for cross-salon debug stats. */
  syntheticDebug?: SyntheticDebugAccum;
  /**
   * Controls tagging for generated (working-hours) slots.
   * "working_hours_only" → real salon + real hours, no calendar data. isSynthetic=false. Valid for QuickAccess.
   * "synthetic_projection" (default) → L6 last-resort. isSynthetic=true. Blocked by QuickAccess policy.
   */
  workingHoursContext?: "working_hours_only" | "synthetic_projection";
  /** Date used for calendar-verified generation from appointments. */
  requestedDate?: string;
}

function readSalonAppointments(salon: PlatformSalon): AvailabilityAppointment[] {
  const raw = salon.appointments;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (app): app is AvailabilityAppointment =>
      app != null &&
      typeof app === "object" &&
      typeof (app as AvailabilityAppointment).date === "string" &&
      typeof (app as AvailabilityAppointment).time === "string" &&
      typeof (app as AvailabilityAppointment).status === "string",
  );
}

function makeCandidates(
  salons: PlatformSalon[],
  useSynthetic = false,
  opts: MakeCandidatesOpts = {},
): SlotCandidate[] {
  const candidates: SlotCandidate[] = [];

  for (const salon of salons) {
    const salonId = salon.id ?? salon._id ?? "";

    // ── Real slots from nextSlots (calendar_verified) ────────────────────────
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
        availabilityConfidence: "calendar_verified",
        slotOrigins: ["real"],
      });
    }

    // ── Verified free slots from workingHours + appointments ────────────────
    const appointments = readSalonAppointments(salon);
    if (!useSynthetic && opts.requestedDate && salon.workingHours && appointments.length > 0) {
      const services = salon.services ?? [];
      for (const svc of services) {
        const svcRaw = svc as Record<string, unknown>;
        const svcVars = Array.isArray(svcRaw.variants)
          ? (svcRaw.variants as { duration?: number }[])
          : [];
        const variantDurs = svcVars.map((v) => v.duration ?? 0).filter((d) => d > 0);
        const duration =
          svcRaw.type === "variant" && variantDurs.length > 0
            ? Math.min(...variantDurs)
            : (svc.duration ?? 60);

        const verifiedSlots = generateVerifiedSlots({
          workingHours: salon.workingHours as WorkingHours,
          appointments,
          date: opts.requestedDate,
          requestedDuration: duration,
        });

        for (const slot of verifiedSlots) {
          candidates.push({
            salon,
            startTime: slot.startTime,
            endTime: slot.endTime,
            serviceId: svc.id ?? svc._id ?? null,
            service: svc,
            category: resolveServiceCategory(svc),
            serviceName: svc.name,
            isSynthetic: false,
            availabilityConfidence: "calendar_verified",
            slotOrigins: ["real"],
          });
        }
      }
    }

    // ── Synthetic recovery (last resort — only runs when useSynthetic=true) ──
    // Synthetic generation is gated by:
    //   1. resolveArrivalFeasibility per slot (in generateSlotsFromWorkingHours)
    //   2. SYNTHETIC_MAX_TOTAL_PER_CALL per (salon × service)
    //   3. opts.maxSyntheticTotal global cap across all salons
    if (useSynthetic && salon.workingHours) {
      const acc = opts.syntheticDebug;
      const globalCap = opts.maxSyntheticTotal ?? SYNTHETIC_GLOBAL_CAP;

      // Stop early if global cap already reached
      if (acc && acc.accepted >= globalCap) {
        if (acc) acc.capHit = true;
        break;
      }

      // Per-salon distance for arrival feasibility
      const userDistanceKm =
        opts.userLat != null &&
        opts.userLng != null &&
        salon.lat != null &&
        salon.lng != null
          ? haversineKm(opts.userLat, opts.userLng, salon.lat, salon.lng)
          : typeof salon.distance === "number"
            ? salon.distance
            : undefined;

      // City match for conservative travel buffer
      const cityMatch =
        opts.preferredCity != null && salon.city != null
          ? stripDiacritics(salon.city) === stripDiacritics(opts.preferredCity)
          : undefined;

      const services = salon.services ?? [];
      const targetServices = services.length > 0 ? services : [undefined];

      for (const svc of targetServices) {
        // Skip if real slots already cover this service
        const hasRealSlots =
          svc != null &&
          (salon.nextSlots ?? []).some((s) => s.serviceId === (svc.id ?? svc._id));
        if (hasRealSlots) continue;

        // Re-check global cap per service iteration
        if (acc && acc.accepted >= globalCap) {
          acc.capHit = true;
          break;
        }

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

        // Remaining capacity under global cap for this salon×service call
        const remainingGlobal = globalCap - (acc?.accepted ?? 0);

        const genResult = generateSlotsFromWorkingHours(mapped, {
          now: opts.now,
          serviceDuration: duration,
          distanceKm: userDistanceKm,
          cityMatch,
          // geoConfidence omitted — defaults to 'none' (most conservative)
          maxTotal: Math.min(SYNTHETIC_MAX_TOTAL_PER_CALL, remainingGlobal),
          context: opts.workingHoursContext ?? "synthetic_projection",
        });

        // Merge debug stats into accumulator
        if (acc) {
          acc.generated += genResult.debug.generated;
          acc.accepted += genResult.debug.accepted;
          acc.rejectedByFeasibility += genResult.debug.rejectedByFeasibility;
          if (genResult.debug.capHit) acc.capHit = true;
        }

        const category = resolveServiceCategory(svc);
        const serviceId = svc ? (svc.id ?? svc._id ?? null) : null;
        const serviceName = svc?.name ?? "Slobodan termin";

        for (const g of genResult.slots) {
          candidates.push({
            salon,
            startTime: g.startTime,
            endTime: g.endTime,
            serviceId,
            service: svc,
            category,
            serviceName,
            isSynthetic: true,
            availabilityConfidence: g.availabilityConfidence,
            slotOrigins: [...g.slotOrigins],
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
  const slotOrigins = deriveSlotOrigins(c, fallbackLevel, params);
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
    salonLat: c.salon.lat,
    salonLng: c.salon.lng,
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
    availabilityConfidence: c.availabilityConfidence,
    availabilityConfidenceScore: getAvailabilityConfidenceScore(c.availabilityConfidence),
    availabilityType: getAvailabilityType(c.availabilityConfidence),
    slotOrigins,
  };
}

// ── Slot origin derivation ────────────────────────────────────────────────────
//
// Maps fallback level + candidate attributes → semantic SlotOrigin[].
// Called inside toSearchResult so every SearchResult leaving findBestSlots
// carries accurate origins regardless of which level matched first.
//
// Rules:
//   L1 exact               → ["real"]
//   L2 relaxed time        → ["relaxed_time"]
//   L3 related category    → ["related_service"]
//   L4 any date/category   → ["relaxed_time"]  (date + time relaxed, same city)
//   L5 nearby city         → ["nearby_city"] or ["nearby_city","related_service"]
//   L6 synthetic           → ["synthetic"] (isSynthetic gate is first)
//
// INVARIANT: "real" and "nearby_city" are mutually exclusive. "real" is only
// emitted at L1. Levels ≥2 reflect at least one relaxation.

type SlotOriginTag = "real" | "synthetic" | "nearby_city" | "relaxed_time" | "related_service";

function deriveSlotOrigins(
  c: SlotCandidate,
  fallbackLevel: number,
  params: NormalizedSearch,
): SlotOriginTag[] {
  if (c.isSynthetic) return ["synthetic"];
  if (fallbackLevel === 1) return ["real"];

  const origins: SlotOriginTag[] = [];

  // City mismatch — city is always in scope, so any cross-city result is "nearby_city"
  const crossCity =
    stripDiacritics(c.salon.city ?? "") !== stripDiacritics(params.cityDisplay);
  if (crossCity) origins.push("nearby_city");

  // Time relaxation — only when a time window was actually requested and L2 relaxed it
  if (fallbackLevel === 2 && params.timeWindowStart != null) {
    origins.push("relaxed_time");
  }

  // Category drift — only when a category was actually requested and L3 relaxed it
  if (fallbackLevel === 3 && params.category != null) {
    origins.push("related_service");
  }

  // L4: date/time relaxation — only when date was requested but slot is on a different date
  if (fallbackLevel === 4 && params.date != null) {
    const slotDate = c.startTime.slice(0, 10);
    if (slotDate !== params.date) origins.push("relaxed_time");
  }

  // L5: category mismatch on top of city mismatch
  if (fallbackLevel >= 5 && crossCity && params.category != null && c.category !== params.category) {
    origins.push("related_service");
  }

  // No specific relaxation detected → slot is an exact match for what was requested
  // (e.g. no category/time constraint was in scope — L4 with no category param)
  return origins.length > 0 ? origins : ["real"];
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
    /** Injected wall clock for past-slot check — defaults to real Date.now(). */
    nowMs?: number;
  },
): SlotCandidate[] {
  const nowMs = opts.nowMs ?? Date.now();
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

    // Skip past slots (uses injected nowMs — deterministic in tests)
    if (new Date(c.startTime).getTime() <= nowMs) return false;

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

export interface SyntheticDebug {
  /** True when L1–L5 returned real candidates (synthetic never ran). */
  realCandidatesFound: boolean;
  syntheticGenerated: number;
  syntheticAccepted: number;
  syntheticRejectedByFeasibility: number;
  /** True when generation was halted by SYNTHETIC_GLOBAL_CAP. */
  capHit: boolean;
}

export interface FindSlotsResult {
  results: SearchResult[];
  fallbackLevel: number;
  fallbackLabel: string;
  /** Present when synthetic generation ran (L6). Absent for real-slot results. */
  syntheticDebug?: SyntheticDebug;
}

export function findBestSlots(
  salons: PlatformSalon[],
  params: NormalizedSearch,
  opts: {
    augmentWithSynthetic?: boolean;
    /** Injected wall clock for deterministic synthetic generation in tests. */
    now?: Date;
  } = {},
): FindSlotsResult {
  // Resolve `now` once — passed down to all synthetic generation calls
  const now = opts.now ?? new Date();

  const today = todayInBelgrade();
  const tomorrow = tomorrowInBelgrade();
  const limit = params.limit;
  const nowMs = now.getTime();

  const allCandidates = makeCandidates(salons, false, { requestedDate: params.date });

  // MVP augmentation: for same-city salons with workingHours but no calendar slots,
  // generate working_hours_only candidates. These are tagged isSynthetic=false and
  // availabilityConfidence="working_hours_only" — valid for QuickAccess.
  // This runs in parallel with real nextSlots (not as a last resort), so L1-L4
  // can find realistic slots even when the calendar engine is not yet active.
  const sameCitySalons = salons.filter(
    (s) => stripDiacritics(s.city ?? "") === stripDiacritics(params.cityDisplay),
  );
  const workingHoursAugOpts: MakeCandidatesOpts = {
    now,
    userLat: params.lat,
    userLng: params.lng,
    preferredCity: params.cityDisplay,
    maxSyntheticTotal: 30, // lower cap — augmentation only, not recovery
    workingHoursContext: "working_hours_only",
    requestedDate: params.date,
  };
  const workingHoursCandidates = makeCandidates(sameCitySalons, true, workingHoursAugOpts);

  // Augmented pool for L1-L4: real nextSlots + working_hours_only (same city only)
  const augmentedCandidates = [...allCandidates, ...workingHoursCandidates];

  function toResults(filtered: SlotCandidate[], level: number): SearchResult[] {
    return filtered
      .map((c) => toSearchResult(c, params, level, today, tomorrow))
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
  }

  // ── Debug logging (Task 7) ────────────────────────────────────────────────
  const confBreakdown = (pool: SlotCandidate[]) => {
    const calendar = pool.filter((c) => c.availabilityConfidence === "calendar_verified").length;
    const wh = pool.filter((c) => c.availabilityConfidence === "working_hours_only").length;
    const synth = pool.filter((c) => c.availabilityConfidence === "synthetic_projection").length;
    return `calendar_verified:${calendar} working_hours_only:${wh} synthetic_projection:${synth}`;
  };
  console.log(
    "[QUICKACCESS_PIPELINE] raw candidates:",
    augmentedCandidates.length,
    "| city:", params.cityDisplay,
    "| category:", params.category ?? "any",
    "|", confBreakdown(augmentedCandidates),
  );

  // ── Level 1: exact city + category + date + time window ────────────────────
  if (params.category && params.timeWindowStart != null) {
    const l1 = filterCandidates(augmentedCandidates, params, {
      requireCity: true,
      requireCategory: true,
      requireDate: true,
      requireTimeWindow: true,
      nowMs,
    });
    if (l1.length > 0) {
      console.log("[QUICKACCESS_PIPELINE] after feasibility (L1):", l1.length);
      return { results: toResults(l1, 1), fallbackLevel: 1, fallbackLabel: "exact" };
    }
  }

  // ── Level 2: city + category + date (any time) ────────────────────────────
  if (params.category) {
    const l2 = filterCandidates(augmentedCandidates, params, {
      requireCity: true,
      requireCategory: true,
      requireDate: true,
      requireTimeWindow: false,
      nowMs,
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
      console.log("[QUICKACCESS_PIPELINE] after feasibility (L2):", l2.length);
      return { results: toResults(sorted, 2), fallbackLevel: 2, fallbackLabel: "relaxed-time" };
    }
  }

  // ── Level 3: city + related categories + date ─────────────────────────────
  if (params.category) {
    const l3 = filterCandidates(augmentedCandidates, params, {
      requireCity: true,
      requireCategory: true,
      requireDate: true,
      requireTimeWindow: false,
      allowRelatedCategories: true,
      nowMs,
    });
    if (l3.length > 0) {
      console.log("[QUICKACCESS_PIPELINE] after feasibility (L3):", l3.length);
      return { results: toResults(l3, 3), fallbackLevel: 3, fallbackLabel: "related-categories" };
    }
  }

  // ── Level 4: city + any category + nearest future slots ───────────────────
  const l4 = filterCandidates(augmentedCandidates, params, {
    requireCity: true,
    requireCategory: false,
    requireDate: false,
    requireTimeWindow: false,
    nowMs,
  });
  if (l4.length > 0) {
    console.log("[QUICKACCESS_PIPELINE] after feasibility (L4):", l4.length);
    return { results: toResults(l4, 4), fallbackLevel: 4, fallbackLabel: "nearest-future" };
  }

  // ── Level 5: nearby cities (within 200 km) ────────────────────────────────
  // When augmentWithSynthetic is set (national supplement call), augment real
  // candidates with synthetic so cities with few real nextSlots contribute.
  // Synthetic here is gated by the same feasibility + cap rules as L6.
  const syntheticOpts: MakeCandidatesOpts = {
    now,
    userLat: params.lat,
    userLng: params.lng,
    preferredCity: params.cityDisplay,
    maxSyntheticTotal: SYNTHETIC_GLOBAL_CAP,
  };
  const l5Pool = opts.augmentWithSynthetic
    ? makeCandidates(salons, true, syntheticOpts)
    : allCandidates;
  const l5 = filterCandidates(l5Pool, params, {
    requireCity: false,
    requireCategory: false,
    requireDate: false,
    requireTimeWindow: false,
    maxDistanceKm: 200,
    nowMs,
  });
  if (l5.length > 0) {
    console.log("[QUICKACCESS_PIPELINE] after feasibility (L5):", l5.length, opts.augmentWithSynthetic ? "(+synthetic)" : "");
    return { results: toResults(l5, 5), fallbackLevel: 5, fallbackLabel: "nearby-cities" };
  }

  // ── Level 6: last resort — synthetic generation from working hours ─────────
  //
  // REAL AVAILABILITY PRECEDENCE: This block runs only because L1–L5 above
  // returned zero real candidates. Synthetic is never parallel to real results.
  //
  // Same-city salons are sorted first so the global cap fills with same-city
  // slots before cross-city slots (Task 5 — same-city priority).
  const sortedForSynthetic = [...salons].sort((a, b) => {
    const aMatch = stripDiacritics(a.city ?? "") === stripDiacritics(params.cityDisplay) ? 0 : 1;
    const bMatch = stripDiacritics(b.city ?? "") === stripDiacritics(params.cityDisplay) ? 0 : 1;
    return aMatch - bMatch;
  });

  const accumDebug: SyntheticDebugAccum = {
    generated: 0,
    accepted: 0,
    rejectedByFeasibility: 0,
    capHit: false,
  };
  const l6SyntheticOpts: MakeCandidatesOpts = {
    ...syntheticOpts,
    syntheticDebug: accumDebug,
  };

  const withSynthetic = makeCandidates(sortedForSynthetic, true, l6SyntheticOpts);

  const syntheticDebugResult: SyntheticDebug = {
    realCandidatesFound: false,
    syntheticGenerated: accumDebug.generated,
    syntheticAccepted: accumDebug.accepted,
    syntheticRejectedByFeasibility: accumDebug.rejectedByFeasibility,
    capHit: accumDebug.capHit,
  };

  if (withSynthetic.length > 0) {
    const l6 = filterCandidates(withSynthetic, params, {
      requireCity: false,
      requireCategory: false,
      requireDate: false,
      requireTimeWindow: false,
      nowMs,
    });
    if (l6.length > 0) {
      console.log(
        "[QUICKACCESS_PIPELINE] after feasibility (L6 synthetic):",
        l6.length,
        `(generated:${accumDebug.generated} accepted:${accumDebug.accepted} rejected:${accumDebug.rejectedByFeasibility} cap:${accumDebug.capHit})`,
      );
      return {
        results: toResults(l6, 6),
        fallbackLevel: 6,
        fallbackLabel: "synthetic",
        syntheticDebug: syntheticDebugResult,
      };
    }
  }

  console.log("[QUICKACCESS_PIPELINE] no-results (all levels exhausted)");
  return {
    results: [],
    fallbackLevel: 0,
    fallbackLabel: "no-salons",
    syntheticDebug: syntheticDebugResult,
  };
}

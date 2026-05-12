// src/lib/search/buildBookingDiscoveryGroups.ts

import type { SearchResult } from "@/types/slots";
import type { RankedSlot } from "./rankSearchResults";

export type BookingDiscoveryMode =
  | "initial_load"
  | "geo_load"
  | "saved_preference"
  | "search"
  | "ai_assisted"
  | "recovery";

export type BookingDiscoveryGroupType =
  | "best_nearby"
  | "exact_city"
  | "popular_services"
  | "recommended_salons"
  | "nearby_cities"
  | "related_services"
  | "flexible_availability"
  | "ai_recovery";

export interface SearchRecoveryState {
  exactMatchFound: boolean;
  semanticMatchFound: boolean;
  nearbyCityUsed: boolean;
  relatedServiceUsed: boolean;
  fallbackReason?: string;
}

export interface BookingDiscoveryQuery {
  city?: string;
  category?: string;
  service?: string;
  date?: string;
  timeWindowStart?: number;
  timeWindowEnd?: number;
}

export interface BookingDiscoveryGroup {
  id: string;
  type: BookingDiscoveryGroupType;
  title: string;
  subtitle?: string;
  slots: RankedSlot[];
  priority: number;
  reason?: string;
  city?: string;
  relationReason?: string;
  confidenceLevel: "high" | "medium" | "low";
  fallbackLevel: number;
}

export interface BookingWidgetDebug {
  mode: BookingDiscoveryMode;
  inputSlots: number;
  afterQuickAccessDedup: number;
  groupCount: number;
  groups: Array<{
    type: BookingDiscoveryGroupType;
    title: string;
    inputCount: number;
    outputCount: number;
    reason?: string;
  }>;
  emptyReason?: string;
}

export interface BookingDiscoveryBuildResult {
  groups: BookingDiscoveryGroup[];
  debug: BookingWidgetDebug;
}

interface BuildBookingDiscoveryGroupsInput {
  slots: RankedSlot[];
  quickAccessSlotIds?: string[];
  query: BookingDiscoveryQuery;
  userLocation?: { lat: number; lng: number };
  userCity?: string;
  fallbackLevel: number;
  mode?: BookingDiscoveryMode;
  recoveryState?: Partial<SearchRecoveryState>;
}

export function bookingSlotId(slot: SearchResult): string {
  return `${slot.salonId}|${slot.startTime}|${slot.serviceName}`;
}

function exactSlotKey(slot: SearchResult): string {
  return `${slot.salonId}|${slot.startTime}|${slot.serviceId ?? slot.serviceName}`;
}

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isTrustworthy(slot: SearchResult): boolean {
  return (
    slot.availabilityConfidence === "calendar_verified" ||
    slot.availabilityConfidence === "working_hours_only" ||
    (!slot.availabilityConfidence && slot.isSynthetic !== true)
  );
}

function confidenceLevel(
  slots: SearchResult[],
): BookingDiscoveryGroup["confidenceLevel"] {
  if (slots.some((s) => s.availabilityConfidence === "calendar_verified"))
    return "high";
  if (slots.some((s) => s.availabilityConfidence === "working_hours_only"))
    return "medium";
  return "low";
}

function sameCity(slot: SearchResult, city: string | undefined): boolean {
  if (!city) return true;
  return normalize(slot.city) === normalize(city);
}

function sameServiceOrCategory(
  slot: SearchResult,
  query: BookingDiscoveryQuery,
): boolean {
  if (query.service)
    return normalize(slot.serviceName).includes(normalize(query.service));
  if (query.category)
    return normalize(slot.category) === normalize(query.category);
  return true;
}

function hasSearchIntent(query: BookingDiscoveryQuery): boolean {
  return Boolean(
    query.city ||
    query.category ||
    query.service ||
    query.date ||
    query.timeWindowStart != null,
  );
}

function hasTimeIntent(query: BookingDiscoveryQuery): boolean {
  return Boolean(
    query.date || query.timeWindowStart != null || query.timeWindowEnd != null,
  );
}

function inferMode(
  input: BuildBookingDiscoveryGroupsInput,
): BookingDiscoveryMode {
  if (input.mode) return input.mode;
  if (input.recoveryState?.fallbackReason || input.fallbackLevel >= 3)
    return "recovery";
  if (hasSearchIntent(input.query)) return "search";
  if (input.userLocation) return "geo_load";
  return "initial_load";
}

function scoreForPopular(slot: RankedSlot): number {
  const confidence = slot.availabilityConfidenceScore ?? 0.5;
  const rating = typeof slot.rating === "number" ? slot.rating / 5 : 0.5;
  const distance =
    typeof slot.distanceScore === "number" ? slot.distanceScore : 0.5;
  return confidence * 0.5 + rating * 0.25 + distance * 0.25;
}

function sortedByDistance(slots: RankedSlot[]): RankedSlot[] {
  return [...slots].sort((a, b) => {
    const da = a.distanceKm ?? Number.POSITIVE_INFINITY;
    const db = b.distanceKm ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return (b.rankingMeta?.score ?? 0) - (a.rankingMeta?.score ?? 0);
  });
}

function sortedByPopular(slots: RankedSlot[]): RankedSlot[] {
  return [...slots].sort((a, b) => scoreForPopular(b) - scoreForPopular(a));
}

function pickDiverse(
  slots: RankedSlot[],
  limit: number,
  opts: {
    avoidSlotIds?: Set<string>;
    usedSlotKeys?: Set<string>;
    usedSalonService?: Set<string>;
    preferAvoided?: boolean;
    relaxUsedWhenEmpty?: boolean;
  } = {},
): RankedSlot[] {
  const out: RankedSlot[] = [];
  const seenSalon = new Set<string>();
  const seenExact = new Set<string>();
  const avoided = opts.avoidSlotIds ?? new Set<string>();
  const usedSlotKeys = opts.usedSlotKeys ?? new Set<string>();
  const usedSalonService = opts.usedSalonService ?? new Set<string>();

  const pass = (
    allowAvoided: boolean,
    ignoreCrossGroupUsed: boolean,
    allowSameSalon: boolean,
    allowSameSalonService: boolean,
  ) => {
    for (const slot of slots) {
      const id = bookingSlotId(slot);
      const exact = exactSlotKey(slot);
      const salonService = `${slot.salonId}|${slot.category}|${slot.serviceName}`;
      if (!allowAvoided && avoided.has(id)) continue;
      if (seenExact.has(exact)) continue;
      if (!ignoreCrossGroupUsed && usedSlotKeys.has(exact)) continue;
      if (!allowSameSalon && seenSalon.has(slot.salonId)) continue;
      if (
        !allowSameSalonService &&
        !ignoreCrossGroupUsed &&
        usedSalonService.has(salonService)
      )
        continue;
      seenSalon.add(slot.salonId);
      seenExact.add(exact);
      usedSlotKeys.add(exact);
      usedSalonService.add(salonService);
      out.push(slot);
      if (out.length >= limit) return;
    }
  };

  // Marketplace rows prefer one salon per row, but that is a soft rule. If the
  // MVP data pool has one strong salon with several real slots, fill the row
  // with those slots instead of rendering a lonely single-card section.
  pass(false, false, false, false);
  if (out.length < limit) pass(false, false, true, true);
  if (out.length === 0 || (opts.preferAvoided && out.length < limit))
    pass(true, false, false, false);
  if (opts.preferAvoided && out.length < limit) pass(true, false, true, true);
  if (opts.relaxUsedWhenEmpty && out.length === 0) {
    pass(false, true, false, false);
    if (out.length < limit) pass(false, true, true, true);
    if (out.length === 0 || (opts.preferAvoided && out.length < limit))
      pass(true, true, false, false);
    if (opts.preferAvoided && out.length < limit) pass(true, true, true, true);
  }
  return out;
}

function makeGroup(params: {
  id: string;
  type: BookingDiscoveryGroupType;
  title: string;
  subtitle?: string;
  slots: RankedSlot[];
  priority: number;
  reason: string;
  city?: string;
  relationReason?: string;
  fallbackLevel: number;
  inputCount: number;
}): {
  group?: BookingDiscoveryGroup;
  debug: BookingWidgetDebug["groups"][number];
} {
  const debug = {
    type: params.type,
    title: params.title,
    inputCount: params.inputCount,
    outputCount: params.slots.length,
    reason: params.reason,
  };

  if (params.slots.length === 0) return { debug };
  return {
    debug,
    group: {
      id: params.id,
      type: params.type,
      title: params.title,
      subtitle: params.subtitle,
      slots: params.slots,
      priority: params.priority,
      reason: params.reason,
      city: params.city,
      relationReason: params.relationReason,
      confidenceLevel: confidenceLevel(params.slots),
      fallbackLevel: params.fallbackLevel,
    },
  };
}

export function buildBookingDiscoveryGroups(
  input: BuildBookingDiscoveryGroupsInput,
): BookingDiscoveryBuildResult {
  const mode = inferMode(input);
  const quickAccessIds = new Set(input.quickAccessSlotIds ?? []);
  const trustworthy = input.slots.filter(isTrustworthy);
  const usedSlotKeys = new Set<string>();
  const usedSalonService = new Set<string>();
  const groups: BookingDiscoveryGroup[] = [];
  const debugGroups: BookingWidgetDebug["groups"] = [];

  const city = input.query.city ?? input.userCity;
  const exactCitySlots = trustworthy.filter((slot) => sameCity(slot, city));
  const nearbyCitySlots = trustworthy.filter(
    (slot) => city && !sameCity(slot, city),
  );
  const exactServiceSlots = trustworthy.filter((slot) =>
    sameServiceOrCategory(slot, input.query),
  );
  const relatedServiceSlots = exactCitySlots.filter(
    (slot) => !sameServiceOrCategory(slot, input.query),
  );
  const popularServiceSlots = sortedByPopular(trustworthy);
  const recommendedSalonSlots = sortedByPopular(trustworthy);
  const flexibleAvailabilitySlots =
    exactCitySlots.length > 0 ? exactCitySlots : trustworthy;

  const add = (
    params: Omit<Parameters<typeof makeGroup>[0], "fallbackLevel">,
  ) => {
    const made = makeGroup({ ...params, fallbackLevel: input.fallbackLevel });
    debugGroups.push(made.debug);
    if (made.group) groups.push(made.group);
  };

  const bestNearbyPool = sortedByDistance(city ? exactCitySlots : trustworthy);
  const exactPool = exactServiceSlots.filter((slot) =>
    city ? sameCity(slot, city) : true,
  );
  const exactWeak = exactPool.length < 3;

  if (mode === "ai_assisted") {
    add({
      id: "ai_recovery:best",
      type: "ai_recovery",
      title: "Najbolji pronađeni termini",
      slots: pickDiverse(sortedByPopular(trustworthy), 5, {
        avoidSlotIds: quickAccessIds,
        usedSlotKeys,
        usedSalonService,
      }),
      priority: 1,
      reason: "ai_assisted_best_matches",
      inputCount: trustworthy.length,
    });
  } else if (
    !hasSearchIntent(input.query) ||
    mode === "geo_load" ||
    mode === "initial_load"
  ) {
    add({
      id: "best_nearby",
      type: "best_nearby",
      title: "Najbliži slobodni termini",
      slots: pickDiverse(bestNearbyPool, 5, {
        avoidSlotIds: quickAccessIds,
        usedSlotKeys,
        usedSalonService,
      }),
      priority: 1,
      reason: "closest_trustworthy_availability",
      city,
      inputCount: bestNearbyPool.length,
    });
  } else {
    const serviceCity =
      Boolean(input.query.category || input.query.service) && city;
    add({
      id: "exact_city",
      type: "exact_city",
      title: serviceCity
        ? `Najbolji rezultati u ${city}`
        : city
          ? `Najbolji termini - ${city}`
          : input.query.service
            ? `Najbolji termini za ${input.query.service}`
            : "Najbolji slobodni termini",
      subtitle:
        exactPool.length === 0 && (input.query.category || input.query.service)
          ? "Ali pronašli smo najbliže dostupne opcije."
          : undefined,
      slots: pickDiverse(
        sortedByPopular(exactPool.length > 0 ? exactPool : exactServiceSlots),
        5,
        {
          avoidSlotIds: quickAccessIds,
          usedSlotKeys,
          usedSalonService,
        },
      ),
      priority: 1,
      reason: "exact_or_strongest_semantic_match",
      city,
      inputCount:
        exactPool.length > 0 ? exactPool.length : exactServiceSlots.length,
    });
  }

  const row2Type =
    mode === "recovery" || exactWeak || input.recoveryState?.relatedServiceUsed
      ? "related_services"
      : "popular_services";
  add({
    id: row2Type,
    type: row2Type,
    title:
      row2Type === "related_services"
        ? city
          ? `Slične usluge u ${city}`
          : "Slične usluge"
        : city
          ? `Popularno u blizini`
          : "Popularne usluge",
    subtitle:
      row2Type === "related_services"
        ? "Povezane opcije bez sintetičkih termina."
        : undefined,
    slots: pickDiverse(
      row2Type === "related_services"
        ? sortedByPopular(relatedServiceSlots)
        : popularServiceSlots,
      5,
      {
        avoidSlotIds: quickAccessIds,
        usedSlotKeys,
        usedSalonService,
        preferAvoided: true,
        relaxUsedWhenEmpty: true,
      },
    ),
    priority: 2,
    reason:
      row2Type === "related_services"
        ? "related_service_recovery"
        : "popular_diverse_services",
    city,
    relationReason:
      row2Type === "related_services"
        ? "same_city_related_category"
        : undefined,
    inputCount:
      row2Type === "related_services"
        ? relatedServiceSlots.length
        : popularServiceSlots.length,
  });

  const nearbyByCity = sortedByDistance(nearbyCitySlots);
  const row3Type =
    nearbyByCity.length > 0 ? "nearby_cities" : "recommended_salons";
  add({
    id: row3Type,
    type: row3Type,
    title:
      row3Type === "nearby_cities"
        ? city
          ? `U blizini ${city}`
          : "Termini u blizini"
        : "Preporučeni saloni",
    subtitle:
      row3Type === "nearby_cities"
        ? "Alternativni gradovi sa dostupnim terminima."
        : undefined,
    slots: pickDiverse(
      row3Type === "nearby_cities" ? nearbyByCity : recommendedSalonSlots,
      5,
      {
        avoidSlotIds: quickAccessIds,
        usedSlotKeys,
        usedSalonService,
        preferAvoided: true,
        relaxUsedWhenEmpty: true,
      },
    ),
    priority: 3,
    reason:
      row3Type === "nearby_cities"
        ? "nearby_city_recovery"
        : "recommended_salon_diversity",
    inputCount:
      row3Type === "nearby_cities"
        ? nearbyByCity.length
        : recommendedSalonSlots.length,
  });

  if (hasTimeIntent(input.query)) {
    add({
      id: "flexible_availability",
      type: "flexible_availability",
      title: "Fleksibilni termini",
      subtitle: "Širi vremenski izbor ako tačan termin nije idealan.",
      slots: pickDiverse(sortedByPopular(flexibleAvailabilitySlots), 5, {
        avoidSlotIds: quickAccessIds,
        usedSlotKeys,
        usedSalonService,
        preferAvoided: true,
        relaxUsedWhenEmpty: true,
      }),
      priority: 4,
      reason: "time_recovery_placeholder",
      city,
      inputCount: flexibleAvailabilitySlots.length,
    });
  }

  const ordered = groups
    .sort((a, b) => a.priority - b.priority)
    .slice(0, Math.max(3, Math.min(groups.length, 4)));

  const debug: BookingWidgetDebug = {
    mode,
    inputSlots: input.slots.length,
    afterQuickAccessDedup: trustworthy.filter(
      (slot) => !quickAccessIds.has(bookingSlotId(slot)),
    ).length,
    groupCount: ordered.length,
    groups: debugGroups,
    emptyReason:
      ordered.length === 0 ? "no_trustworthy_discovery_slots" : undefined,
  };

  return { groups: ordered, debug };
}

/**
 * GET /api/search
 *
 * Fetches salon profiles and runs findBestSlots (6-level fallback).
 *
 * City priority for national fallback: user city → nearby → CITY_POPULARITY order.
 * Slot diversity: max 2 slots per salon per city group.
 */

import { NextResponse } from "next/server";
import {
  platformClient,
  convertWorkingHours,
  type PlatformSalon,
} from "@/lib/api/platformClient";
import {
  normalizeSearch,
} from "@/lib/search/normalizeSearch";
import { fetchCategories } from "@/lib/search/fetchCategories";
import { findBestSlots, pickDiverseSlots } from "@/lib/search/findBestSlots";
import { SERBIAN_CITIES, haversineKm, CITY_POPULARITY } from "@/lib/cities";
import { stripDiacritics } from "@/lib/intent/parseIntent";
import { enrichGeoSignals } from "@/lib/search/enrichGeoSignals";
import { normalizeSearchIntent } from "@/lib/search/normalizeSearchIntent";
import {
  buildSearchSuggestions,
} from "@/lib/search/buildSearchSuggestions";
import { normalizeSemanticTerm } from "@/lib/search/serviceSemanticMap";
import { resolveSearchRecoveryScenario } from "@/lib/search/resolveSearchRecoveryScenario";
import type { SearchApiResponse, SearchResult } from "@/types/slots";
import type { SearchRecoveryState } from "@/types/searchRecovery";

function geoReference(params: {
  lat?: number;
  lng?: number;
  cityRef?: { lat: number; lng: number };
}): { lat?: number; lng?: number } {
  return {
    lat: params.lat ?? params.cityRef?.lat,
    lng: params.lng ?? params.cityRef?.lng,
  };
}

/**
 * Groups results by city and sorts cities by priority:
 * 1. User's requested city (exact match)
 * 2. Nearest cities by distance (if cityRef available)
 * 3. National popularity score
 */
function groupAndSortByCityPriority(
  results: SearchResult[],
  requestedCity: string,
  cityRef: { lat: number; lng: number } | undefined,
): { city: string; slots: SearchResult[] }[] {
  const cityMap = new Map<string, SearchResult[]>();
  for (const r of results) {
    if (!r.city) continue;
    const bucket = cityMap.get(r.city) ?? [];
    bucket.push(r);
    cityMap.set(r.city, bucket);
  }

  const requestedNorm = requestedCity.toLowerCase().trim();

  const sortedCities = [...cityMap.keys()].sort((a, b) => {
    // Requested city always first
    const aIsRequested = a.toLowerCase() === requestedNorm;
    const bIsRequested = b.toLowerCase() === requestedNorm;
    if (aIsRequested && !bIsRequested) return -1;
    if (bIsRequested && !aIsRequested) return 1;

    // Then sort by distance if we have coordinates
    if (cityRef) {
      const aCoords = SERBIAN_CITIES.find((c) => c.name === a);
      const bCoords = SERBIAN_CITIES.find((c) => c.name === b);
      if (aCoords && bCoords) {
        const distA = haversineKm(cityRef.lat, cityRef.lng, aCoords.lat, aCoords.lng);
        const distB = haversineKm(cityRef.lat, cityRef.lng, bCoords.lat, bCoords.lng);
        if (Math.abs(distA - distB) > 5) return distA - distB;
      }
    }

    // National popularity as tiebreaker
    const popA = CITY_POPULARITY[a] ?? 0;
    const popB = CITY_POPULARITY[b] ?? 0;
    return popB - popA;
  });

  return sortedCities.slice(0, 3).map((city) => {
    const slots = cityMap.get(city) ?? [];
    const byRelevance = [...slots].sort(
      (a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0),
    );
    // Allow up to 5 per salon so single-salon cities still show 5 slots
    return { city, slots: pickDiverseSlots(byRelevance, 5, 5) };
  });
}

function sameCityName(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return stripDiacritics(a).toLowerCase() === stripDiacritics(b).toLowerCase();
}

function slotCategoryMatches(slot: SearchResult, category?: string): boolean {
  if (!category) return false;
  return normalizeSemanticTerm(slot.category) === normalizeSemanticTerm(category);
}

function slotServiceMatches(slot: SearchResult, candidates: string[]): boolean {
  const service = normalizeSemanticTerm(slot.serviceName);
  return candidates.some((candidate) => {
    const normalized = normalizeSemanticTerm(candidate);
    return normalized.length > 0 && service.includes(normalized);
  });
}

function partitionRecoverySlots(params: {
  slots: SearchResult[];
  requestedCity: string;
  intent: ReturnType<typeof normalizeSearchIntent>;
}): {
  exactRequestedCitySlots: SearchResult[];
  relatedRequestedCitySlots: SearchResult[];
  exactOtherCitySlots: SearchResult[];
  relatedOtherCitySlots: SearchResult[];
} {
  const exactCandidates = [
    params.intent.originalQuery,
    ...params.intent.serviceCandidates.filter((term) =>
      params.intent.normalizedQuery
        ? normalizeSemanticTerm(term).includes(params.intent.normalizedQuery) ||
          params.intent.normalizedQuery.includes(normalizeSemanticTerm(term))
        : false,
    ),
  ].filter(Boolean);

  const relatedCandidates = params.intent.serviceCandidates;

  const isExact = (slot: SearchResult) => {
    if (params.intent.shouldSearchCategoryBucket) {
      return slotCategoryMatches(slot, params.intent.categoryKey);
    }
    return slotServiceMatches(slot, exactCandidates);
  };

  const isRelated = (slot: SearchResult) => {
    if (isExact(slot)) return false;
    if (params.intent.categoryKey && slotCategoryMatches(slot, params.intent.categoryKey)) return true;
    return slotServiceMatches(slot, relatedCandidates);
  };

  const exactRequestedCitySlots: SearchResult[] = [];
  const relatedRequestedCitySlots: SearchResult[] = [];
  const exactOtherCitySlots: SearchResult[] = [];
  const relatedOtherCitySlots: SearchResult[] = [];

  for (const slot of params.slots) {
    const inRequestedCity = sameCityName(slot.city, params.requestedCity);
    if (isExact(slot)) {
      if (inRequestedCity) exactRequestedCitySlots.push(slot);
      else exactOtherCitySlots.push(slot);
    } else if (isRelated(slot)) {
      if (inRequestedCity) relatedRequestedCitySlots.push(slot);
      else relatedOtherCitySlots.push(slot);
    }
  }

  if (params.intent.queryType === "empty" || params.intent.queryType === "city_only") {
    return {
      exactRequestedCitySlots: params.slots.filter((slot) => sameCityName(slot.city, params.requestedCity)),
      relatedRequestedCitySlots: [],
      exactOtherCitySlots: params.slots.filter((slot) => !sameCityName(slot.city, params.requestedCity)),
      relatedOtherCitySlots: [],
    };
  }

  return {
    exactRequestedCitySlots,
    relatedRequestedCitySlots,
    exactOtherCitySlots,
    relatedOtherCitySlots,
  };
}

export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  const categories = await fetchCategories();
  const rawQuery =
    searchParams.get("query") ??
    searchParams.get("q") ??
    searchParams.get("service") ??
    searchParams.get("subcategory") ??
    "";
  const intent = normalizeSearchIntent({
    rawQuery,
    city: searchParams.get("city") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    service: searchParams.get("service") ?? searchParams.get("subcategory") ?? undefined,
    routeCategory: searchParams.get("routeCategory") ?? undefined,
  });

  const params = normalizeSearch({
    city: searchParams.get("city") ?? undefined,
    category: intent.categoryKey ?? searchParams.get("category") ?? undefined,
    subcategory: intent.shouldSearchCategoryBucket
      ? undefined
      : (searchParams.get("subcategory") ?? searchParams.get("service") ?? rawQuery ?? undefined),
    date: searchParams.get("date") ?? undefined,
    time: searchParams.get("time") ?? undefined,
    timeWindowStart: searchParams.get("timeWindowStart") ?? undefined,
    timeWindowEnd: searchParams.get("timeWindowEnd") ?? undefined,
    lat: searchParams.get("lat") ?? undefined,
    lng: searchParams.get("lng") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    rawQuery,
    serviceCandidates: intent.shouldUseSemanticExpansion
      ? intent.serviceCandidates
      : intent.normalizedQuery
        ? [intent.originalQuery]
        : undefined,
    categories,
  });

  const rawQs = Object.fromEntries(new URL(req.url).searchParams);
  console.log("[/api/search] ← raw query:", rawQs);
  console.log("[/api/search] → normalized:", {
    city: params.cityDisplay,
    category: params.category ?? null,
    canonicalCategory: params.canonicalCategory ?? null,
    intent,
    date: params.date,
    time:
      params.timeWindowStart != null
        ? `${params.timeWindowStart}:00–${params.timeWindowEnd}:00`
        : null,
    lat: params.lat ?? null,
    lng: params.lng ?? null,
    limit: params.limit,
  });

  // ─────────────────────────────────────────────────────────────────
  // Fetch salons + 6-level fallback engine
  // ─────────────────────────────────────────────────────────────────
  let salons: PlatformSalon[] = [];
  try {
    salons = await platformClient.getSalonProfiles({
      lat: params.lat,
      lng: params.lng,
    });
  } catch (err) {
    console.error("[/api/search] getSalonProfiles error:", err);
    return NextResponse.json(
      {
        results: [],
        slotsByCity: [],
        bestSlot: null,
        fallbackLevel: 0,
        totalSalons: 0,
        debug: { error: String(err) },
      } satisfies SearchApiResponse,
      { status: 502 },
    );
  }

  console.log(`\n[/api/search] ══ SalonProfile DB dump (${salons.length} total) ══`);
  for (const s of salons) {
    const id = s.id ?? s._id ?? "?";
    const svcNames = (s.services ?? []).map((sv) => `${sv.name}(${sv.duration ?? "?"}min)`).join(", ") || "—";
    const svcCats = (s.services ?? []).map((sv) => sv.category ?? "?").join(", ") || "—";
    const nextSlotsStr = (s.nextSlots ?? []).slice(0, 3).map((ns) => ns.startTime.slice(11, 16)).join(", ") || "—";
    const whKeys = s.workingHours ? Object.keys(s.workingHours).join(", ") : "—";
    console.log(
      `  [${id}] "${s.name}" | city: ${s.city ?? "?"} | services: ${(s.services ?? []).length} | nextSlots: ${(s.nextSlots ?? []).length} | workingHours: [${whKeys}]`,
    );
    console.log(`    services: ${svcNames}`);
    console.log(`    categories: ${svcCats}`);
    console.log(`    nextSlots: ${nextSlotsStr}`);
  }
  console.log(`[/api/search] ══ end SalonProfile dump ══\n`);

  if (salons.length > 30) salons = salons.slice(0, 30);

  // Fetch working hours + full service data per salon in parallel.
  // Full services include `type`, `variants`, and `basePrice` needed for price resolution.
  salons = await Promise.all(
    salons.map(async (s) => {
      const id = s.id ?? s._id ?? "";
      if (!id) return s;
      const [wh, fullServices] = await Promise.allSettled([
        platformClient.getSalonWorkingHours(id),
        platformClient.getSalonServices(id),
      ]);
      return {
        ...s,
        ...(wh.status === "fulfilled" ? { workingHours: convertWorkingHours(wh.value) } : {}),
        ...(fullServices.status === "fulfilled" && fullServices.value.length > 0
          ? { services: fullServices.value }
          : {}),
      };
    }),
  );

  const { results, fallbackLevel, fallbackLabel } = findBestSlots(salons, params);

  // Supplement with national slots so we always show up to 3 cities.
  // findBestSlots stops at L4 (user city) when successful, never reaching L5.
  // By running a second pass on non-user-city salons with cityRef removed,
  // L1–L4 find nothing (city mismatch) and L5 returns all other cities' slots.
  const coveredCities = new Set<string>(
    results.map((r) => r.city).filter((c): c is string => !!c),
  );
  let allResults: typeof results = [...results];
  if (coveredCities.size < 3) {
    const otherSalons = salons.filter((s) => s.city && !coveredCities.has(s.city));
    if (otherSalons.length > 0) {
      const { results: national } = findBestSlots(
        otherSalons,
        { ...params, cityRef: undefined, limit: Math.max(params.limit, 30) },
        { augmentWithSynthetic: true },
      );
      const fresh = national.filter((r) => r.city && !coveredCities.has(r.city));
      allResults = [...results, ...fresh];
    }
  }

  const geoRef = geoReference(params);
  const geoResults = enrichGeoSignals({
    slots: allResults,
    userLat: geoRef.lat,
    userLng: geoRef.lng,
  });
  const recoveryPartitions = partitionRecoverySlots({
    slots: geoResults,
    requestedCity: params.cityDisplay,
    intent,
  });
  const scenario = resolveSearchRecoveryScenario({
    requestedCity: params.cityDisplay,
    normalizedIntent: intent,
    ...recoveryPartitions,
    userLocation:
      geoRef.lat != null && geoRef.lng != null
        ? { lat: geoRef.lat, lng: geoRef.lng }
        : params.cityRef
          ? { lat: params.cityRef.lat, lng: params.cityRef.lng }
          : undefined,
  });
  const selectedResults = scenario.selectedSlots;

  const slotsByCity = groupAndSortByCityPriority(
    selectedResults,
    scenario.recoveryState.effectiveCity ?? params.cityDisplay,
    geoRef.lat != null && geoRef.lng != null
      ? { lat: geoRef.lat, lng: geoRef.lng }
      : params.cityRef,
  );
  const recoveryState = scenario.recoveryState;
  const suggestions = buildSearchSuggestions({
    query: rawQuery,
    city: recoveryState.effectiveCity ?? params.cityDisplay,
    results: selectedResults,
    discovery: geoResults,
    recoveryState,
    intent,
  });

  const response: SearchApiResponse = {
    results: selectedResults,
    discovery: geoResults,
    slotsByCity,
    suggestions,
    recoveryState,
    bestSlot: selectedResults[0] ?? null,
    fallbackLevel,
    totalSalons: salons.length,
    debug: {
      intent: {
        queryType: intent.queryType,
        canonicalCategory: intent.canonicalCategory ?? null,
        serviceCandidates: intent.serviceCandidates,
        categoryCandidates: intent.categoryCandidates,
        categoryBucketUsed: intent.shouldSearchCategoryBucket,
      },
      recovery: {
        exactCityCount: recoveryPartitions.exactRequestedCitySlots.length,
        semanticCityCount: recoveryPartitions.relatedRequestedCitySlots.length,
        relatedCityCount: recoveryPartitions.relatedRequestedCitySlots.length,
        nearbyExactCount: recoveryPartitions.exactOtherCitySlots.length,
        nearbySemanticCount: recoveryPartitions.relatedOtherCitySlots.length,
        finalSelectedCount: selectedResults.length,
        emptyReason: selectedResults.length === 0 ? fallbackLabel : null,
      },
      recoveryDebug: {
        requestedCity: recoveryState.requestedCity,
        effectiveCity: recoveryState.effectiveCity,
        recoveryScenario: recoveryState.recoveryScenario,
        exactRequestedCityCount: recoveryPartitions.exactRequestedCitySlots.length,
        relatedRequestedCityCount: recoveryPartitions.relatedRequestedCitySlots.length,
        exactOtherCityCount: recoveryPartitions.exactOtherCitySlots.length,
        relatedOtherCityCount: recoveryPartitions.relatedOtherCitySlots.length,
        selectedSlotsCount: selectedResults.length,
        nearbyCitySuggestions: recoveryState.nearbyCitySuggestions,
        userMessage: recoveryState.userMessage,
      },
      normalizedCity: params.cityDisplay,
      normalizedCategory: params.category ?? null,
      searchDate: params.date,
      timeWindow:
        params.timeWindowStart != null
          ? `${params.timeWindowStart}:00–${params.timeWindowEnd}:00`
          : null,
      timezone: "Europe/Belgrade",
      totalSlotsFound: geoResults.length,
      fallbackUsed: fallbackLabel,
    },
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}

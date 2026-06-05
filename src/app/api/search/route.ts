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
  convertWorkingHours,
  type PlatformSalon,
} from "@/lib/api/platformClient";
import {
  fetchSearchSalonProfiles,
  fetchSearchSalonServices,
  fetchSearchSalonWorkingHours,
} from "@/lib/search/fetchSearchPlatformData";
import { fetchSalonStats } from "@/lib/seo/salonStats";
import {
  normalizeSearch,
} from "@/lib/search/normalizeSearch";
import { fetchCategories } from "@/lib/search/fetchCategories";
import { ensureCityCatalog } from "@/lib/cities-runtime";
import { findBestSlots, pickDiverseSlots } from "@/lib/search/findBestSlots";
import { SERBIAN_CITIES, haversineKm, CITY_POPULARITY, findCity } from "@/lib/cities";
import { canonicalCity } from "@/lib/geo/canonicalCity";
import { stripDiacritics } from "@/lib/intent/parseIntent";
import { enrichGeoSignals } from "@/lib/search/enrichGeoSignals";
import { normalizeSearchIntent } from "@/lib/search/normalizeSearchIntent";
import {
  buildSearchSuggestions,
} from "@/lib/search/buildSearchSuggestions";
import { normalizeSemanticTerm } from "@/lib/search/serviceSemanticMap";
import { resolveSearchRecoveryScenario } from "@/lib/search/resolveSearchRecoveryScenario";
import type { SearchApiResponse, SearchResult } from "@/types/slots";
import type {
  SearchRecoveryReason,
  SearchRecoveryState,
} from "@/types/searchRecovery";

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

const PLATFORM_FETCH_TIMEOUT_MS = 3000;

/**
 * Race a platform request against a fixed budget. When the platform is
 * slow on a single salon, this prevents one tail-latency call from
 * blocking the rest of the /api/search response. On timeout the promise
 * rejects with a tagged error so Promise.allSettled callers can treat it
 * the same as any other platform failure.
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms = PLATFORM_FETCH_TIMEOUT_MS,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`platform_timeout:${ms}ms`)),
      ms,
    );
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
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
  savedCity: string | undefined,
): { city: string; slots: SearchResult[] }[] {
  const cityMap = new Map<string, SearchResult[]>();
  for (const r of results) {
    if (!r.city) continue;
    const bucket = cityMap.get(r.city) ?? [];
    bucket.push(r);
    cityMap.set(r.city, bucket);
  }

  const requestedNorm = requestedCity.toLowerCase().trim();
  // Build a deterministic ranking anchor in this priority order:
  // 1. user GPS coordinates (cityRef)
  // 2. requested city coordinates (from SERBIAN_CITIES)
  // 3. saved (localStorage) city coordinates
  const rankingAnchor =
    cityRef ??
    (() => {
      const fromRequested = findCity(canonicalCity(requestedCity));
      if (fromRequested) {
        return { lat: fromRequested.lat, lng: fromRequested.lng };
      }
      const fromSaved = savedCity
        ? findCity(canonicalCity(savedCity))
        : undefined;
      return fromSaved
        ? { lat: fromSaved.lat, lng: fromSaved.lng }
        : undefined;
    })();

  const sortedCities = [...cityMap.keys()].sort((a, b) => {
    // Requested city always first
    const aIsRequested = a.toLowerCase() === requestedNorm;
    const bIsRequested = b.toLowerCase() === requestedNorm;
    if (aIsRequested && !bIsRequested) return -1;
    if (bIsRequested && !aIsRequested) return 1;

    // Distance-aware: use whatever anchor is available (GPS > requested > saved).
    if (rankingAnchor) {
      const aCoords = SERBIAN_CITIES.find((c) => c.name === a);
      const bCoords = SERBIAN_CITIES.find((c) => c.name === b);
      if (aCoords && bCoords) {
        const distA = haversineKm(
          rankingAnchor.lat,
          rankingAnchor.lng,
          aCoords.lat,
          aCoords.lng,
        );
        const distB = haversineKm(
          rankingAnchor.lat,
          rankingAnchor.lng,
          bCoords.lat,
          bCoords.lng,
        );
        if (Math.abs(distA - distB) > 5) return distA - distB;
      }
    }

    // No usable anchor (or both cities outside SERBIAN_CITIES, or tied
    // within 5 km): prefer cities with more available slots first, then
    // fall back to popularity as the absolute last resort.
    const countA = cityMap.get(a)?.length ?? 0;
    const countB = cityMap.get(b)?.length ?? 0;
    if (countA !== countB) return countB - countA;
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

  // Hydrate the dynamic city catalog before any city normalization/ranking.
  await ensureCityCatalog();

  const categories = await fetchCategories();
  const savedCityParam = searchParams.get("savedCity") ?? undefined;
  const savedCity = savedCityParam ? canonicalCity(savedCityParam) : undefined;
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
  const effectiveCity = intent.city ?? searchParams.get("city") ?? undefined;
  const effectiveServiceQuery =
    searchParams.get("subcategory") ??
    searchParams.get("service") ??
    intent.originalQuery ??
    rawQuery ??
    undefined;

  const params = normalizeSearch({
    city: effectiveCity,
    category: intent.categoryKey ?? searchParams.get("category") ?? undefined,
    subcategory: intent.shouldSearchCategoryBucket
      ? undefined
      : effectiveServiceQuery,
    date: searchParams.get("date") ?? undefined,
    time: searchParams.get("time") ?? undefined,
    timeWindowStart: searchParams.get("timeWindowStart") ?? intent.timeWindowStart ?? undefined,
    timeWindowEnd: searchParams.get("timeWindowEnd") ?? intent.timeWindowEnd ?? undefined,
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
        ? `${params.timeWindowStart}:00–${params.timeWindowEnd ?? "∞"}`
        : null,
    lat: params.lat ?? null,
    lng: params.lng ?? null,
    limit: params.limit,
  });
  console.debug("[SEARCH_INTENT]", {
    query: rawQuery,
    city: params.cityDisplay,
    service: intent.originalQuery || searchParams.get("service") || searchParams.get("subcategory"),
    category: params.category ?? null,
    timeWindowStart: params.timeWindowStart ?? null,
    timeWindowEnd: params.timeWindowEnd ?? null,
  });

  // ─────────────────────────────────────────────────────────────────
  // Fetch salons + 6-level fallback engine
  // ─────────────────────────────────────────────────────────────────
  let salons: PlatformSalon[] = [];
  try {
    // No 5-salon limit on search — that cap is only for the homepage showcase.
    // Search/AI must see every marketplace salon (e.g. the only salon in a city).
    //
    // Deliberately NOT passing lat/lng here. The platform's /marketplace/salons
    // endpoint does NOT geo-filter: it returns the same marketplace list
    // regardless of coordinates and only uses lat/lng to attach a display
    // `distance` that we recompute locally anyway. Passing them only fragments
    // our cache — every distinct search coordinate becomes its own unstable_cache
    // + fetch entry, so a rarely-hit city's snapshot can stay stale (e.g. miss a
    // newly approved salon) while the canonical no-param listing stays fresh.
    // Fetching without lat/lng collapses all searches onto one cache key that
    // revalidateTag() reliably busts, and we rank by distance locally below
    // (haversine sort + enrichGeoSignals + groupAndSortByCityPriority).
    salons = await fetchSearchSalonProfiles({ limit: 200 });
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

  // The platform list is no longer geo-sorted (we dropped lat/lng from the
  // fetch above). When a location anchor is available, sort by distance locally
  // so the 30-salon safety cap keeps the *nearest* salons instead of an
  // arbitrary slice. Salons without coordinates sort last but are never dropped
  // unless the marketplace exceeds the cap.
  const sortAnchor: { lat: number; lng: number } | undefined =
    params.lat != null && params.lng != null
      ? { lat: params.lat, lng: params.lng }
      : params.cityRef
        ? { lat: params.cityRef.lat, lng: params.cityRef.lng }
        : undefined;
  if (sortAnchor && salons.length > 1) {
    const distanceOf = (s: PlatformSalon) =>
      s.lat != null && s.lng != null
        ? haversineKm(sortAnchor.lat, sortAnchor.lng, s.lat, s.lng)
        : Number.POSITIVE_INFINITY;
    salons = [...salons].sort((a, b) => distanceOf(a) - distanceOf(b));
  }

  if (salons.length > 30) salons = salons.slice(0, 30);

  // Fetch working hours + full service data per salon in parallel.
  // Full services include `type`, `variants`, and `basePrice` needed for price resolution.
  // Per-request 3 s budget per platform call. allSettled keeps the response
  // alive when a single salon fails, but it still waits for the slowest one
  // before resolving. withTimeout() bounds that wait so one slow salon can't
  // hold up the whole /api/search response.
  salons = await Promise.all(
    salons.map(async (s) => {
      const id = s.id ?? s._id ?? "";
      if (!id) return s;
      const tenantId = typeof s.tenantId === "string" ? s.tenantId : undefined;
      const [wh, fullServices, stats] = await Promise.allSettled([
        withTimeout(fetchSearchSalonWorkingHours(id)),
        withTimeout(fetchSearchSalonServices(id)),
        tenantId ? withTimeout(fetchSalonStats(tenantId)) : Promise.resolve(null),
      ]);
      return {
        ...s,
        ...(wh.status === "fulfilled"
          ? { workingHours: convertWorkingHours(wh.value) }
          : {}),
        ...(fullServices.status === "fulfilled" && fullServices.value.length > 0
          ? { services: fullServices.value }
          : {}),
        ...(stats.status === "fulfilled" && stats.value
          ? {
              rating: stats.value.averageRating ?? undefined,
              reviewCount: stats.value.reviewCount,
            }
          : {}),
      };
    }),
  );

  const { results, fallbackLevel, fallbackLabel } = findBestSlots(salons, params);

  // ── Dev debug: per-salon trace for explicit-city searches ─────────────────
  // Helps diagnose "Nema salona u <grad>" when the salon/services exist but no
  // slot surfaces. Only logs in development.
  if (process.env.NODE_ENV !== "production" && effectiveCity) {
    const cityNorm = stripDiacritics(effectiveCity);
    const resultsBySalon = new Map<string, number>();
    for (const r of results) {
      const sid = String(r.salonId ?? "");
      if (sid) resultsBySalon.set(sid, (resultsBySalon.get(sid) ?? 0) + 1);
    }
    const trace = salons.map((s) => {
      const sid = String(s.id ?? s._id ?? "");
      const cityMatches = stripDiacritics(s.city ?? "") === cityNorm;
      const servicesCount = (s.services ?? []).length;
      const workingHoursPresent = Boolean(
        s.workingHours && Object.keys(s.workingHours).length > 0,
      );
      const nextSlotsCount = (s.nextSlots ?? []).length;
      const matchedCount = resultsBySalon.get(sid) ?? 0;
      let filteredOutReason: string | null = null;
      if (matchedCount === 0) {
        if (!cityMatches) filteredOutReason = "city_mismatch";
        else if (servicesCount === 0) filteredOutReason = "no_services";
        else if (!workingHoursPresent && nextSlotsCount === 0)
          filteredOutReason = "no_working_hours_no_slots";
        else filteredOutReason = "no_free_slots_in_window";
      }
      return {
        salonName: s.name,
        city: s.city ?? "",
        cityMatches,
        marketplaceEnabled: true, // platform only returns enabled salons
        servicesCount,
        workingHoursPresent,
        nextSlotsCount,
        generatedSyntheticCount: matchedCount,
        filteredOutReason,
      };
    });
    console.debug("[SEARCH_CITY_TRACE]", {
      requestedCity: effectiveCity,
      totalSalons: salons.length,
      totalResults: results.length,
      salons: trace,
    });
  }

  const selectedCity = params.cityDisplay;
  const sameSelectedCity = (city?: string) =>
    Boolean(selectedCity) &&
    Boolean(city) &&
    stripDiacritics(city!) === stripDiacritics(selectedCity);
  const selectedCityHasSalons = salons.some((salon) =>
    sameSelectedCity(salon.city),
  );
  const bookingWidgetDiscoveryParams =
    !selectedCityHasSalons
      ? {
          ...params,
          // Force the BookingWidget discovery pass past L1-L4 when the selected
          // city has no salons. Keep cityRef so L5 can sort nearby cities from
          // the selected city. For explicit service searches, keep category
          // and service filters so discovery can expand city/time without
          // drifting into unrelated categories.
          cityDisplay: "__bookingwidget_discovery__",
          category: params.explicitServiceIntent ? params.category : undefined,
          canonicalCategory: params.explicitServiceIntent ? params.canonicalCategory : undefined,
          subcategoryNorm: params.explicitServiceIntent ? params.subcategoryNorm : undefined,
          serviceCandidateNorms: params.explicitServiceIntent ? params.serviceCandidateNorms : undefined,
          rawQuery: params.explicitServiceIntent ? params.rawQuery : undefined,
          limit: Math.max(params.limit, 30),
        }
      : { ...params, limit: Math.max(params.limit, 30) };

  // Supplement with national slots so we always show up to 3 cities.
  // findBestSlots stops at L4 (user city) when successful, never reaching L5.
  // By running a second pass on non-user-city salons, L1–L4 find nothing
  // (city mismatch) and L5/L6 returns other cities' slots. Keep cityRef so
  // L5 can actually measure "nearby"; removing it makes no-city selections
  // unable to expand.
  const coveredCities = new Set<string>(
    results.map((r) => r.city).filter((c): c is string => !!c),
  );
  let allResults: typeof results = [...results];
  if (coveredCities.size < 3) {
    const otherSalons = salons.filter((s) => s.city && !coveredCities.has(s.city));
    if (otherSalons.length > 0) {
      const { results: national } = findBestSlots(
        otherSalons,
        bookingWidgetDiscoveryParams,
        { augmentWithSynthetic: true },
      );
      const fresh = national.filter((r) => r.city && !coveredCities.has(r.city));
      allResults = [...results, ...fresh];
    }
  }

  const geoRef = geoReference(params);
  const strictGeoResults = enrichGeoSignals({
    slots: results,
    userLat: geoRef.lat,
    userLng: geoRef.lng,
  });
  const discoveryGeoResults = enrichGeoSignals({
    slots: allResults,
    userLat: geoRef.lat,
    userLng: geoRef.lng,
  });
  const recoveryPartitions = partitionRecoverySlots({
    slots: strictGeoResults,
    requestedCity: params.cityDisplay,
    intent,
  });
  const scenario = resolveSearchRecoveryScenario({
    requestedCity: params.cityDisplay,
    savedCity,
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
    savedCity,
  );
  const recoveryState = scenario.recoveryState;
  const selectedCityHasSlots = strictGeoResults.some((slot) =>
    sameSelectedCity(slot.city),
  );
  const expandedToCities = [
    ...new Set(
      discoveryGeoResults
        .map((slot) => slot.city)
        .filter((city): city is string => Boolean(city) && !sameSelectedCity(city)),
    ),
  ];
  const recoveryReason: SearchRecoveryReason =
    salons.length === 0
      ? "no_platform_slots"
      : !selectedCityHasSalons
        ? "no_city_salons"
        : !selectedCityHasSlots
          ? "no_city_slots"
          : fallbackLevel >= 6
            ? "synthetic_recovery"
            : fallbackLevel >= 5 || expandedToCities.length > 0
              ? "expanded_to_nearby_cities"
              : selectedResults.length === 0 && (rawQuery || params.category)
                ? "no_service_match"
                : selectedResults.length === 0
                  ? "no_exact_slots"
                  : "no_exact_slots";
  recoveryState.selectedCityHasSalons = selectedCityHasSalons;
  recoveryState.selectedCityHasSlots = selectedCityHasSlots;
  recoveryState.reason = recoveryReason;
  recoveryState.expandedToCities = expandedToCities;
  const suggestions = buildSearchSuggestions({
    query: rawQuery,
    city: recoveryState.effectiveCity ?? params.cityDisplay,
    results: selectedResults,
    discovery: discoveryGeoResults,
    recoveryState,
    intent,
  });

  const response: SearchApiResponse = {
    results: selectedResults,
    discovery: discoveryGeoResults,
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
        reason: recoveryReason,
        selectedCityHasSalons,
        selectedCityHasSlots,
        expandedToCities,
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
        reason: recoveryState.reason,
        selectedCityHasSalons,
        selectedCityHasSlots,
        expandedToCities,
      },
      normalizedCity: params.cityDisplay,
      normalizedCategory: params.category ?? null,
      searchDate: params.date,
      timeWindow:
        params.timeWindowStart != null
          ? `${params.timeWindowStart}:00–${params.timeWindowEnd ?? "∞"}`
          : null,
      timezone: "Europe/Belgrade",
      totalSlotsFound: discoveryGeoResults.length,
      fallbackUsed: fallbackLabel,
    },
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}

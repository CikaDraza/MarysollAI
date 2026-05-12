/**
 * GET /api/search
 *
 * If category is provided → delegates to platform /marketplace/search.
 * If no category → fetches ALL salons and runs findBestSlots (6-level fallback).
 *
 * City priority for national fallback: user city → nearby → CITY_POPULARITY order.
 * Slot diversity: max 2 slots per salon per city group.
 */

import { NextResponse } from "next/server";
import {
  platformClient,
  convertWorkingHours,
  type PlatformSearchResult,
  type PlatformSalon,
} from "@/lib/api/platformClient";
import {
  normalizeSearch,
  todayInBelgrade,
  tomorrowInBelgrade,
} from "@/lib/search/normalizeSearch";
import { fetchCategories } from "@/lib/search/fetchCategories";
import { findBestSlots, pickDiverseSlots } from "@/lib/search/findBestSlots";
import { SERBIAN_CITIES, haversineKm, CITY_POPULARITY } from "@/lib/cities";
import { stripDiacritics } from "@/lib/intent/parseIntent";
import { enrichGeoSignals } from "@/lib/search/enrichGeoSignals";
import {
  getAvailabilityConfidenceScore,
  getAvailabilityType,
} from "@/lib/availability/availabilityConfidence";
import type { SearchApiResponse, SearchResult } from "@/types/slots";

const MONTHS_SR = [
  "jan", "feb", "mar", "apr", "maj", "jun",
  "jul", "avg", "sep", "okt", "nov", "dec",
];
const DAYS_SR = ["Ned", "Pon", "Uto", "Sre", "Čet", "Pet", "Sub"];

function formatTimeLabel(iso: string): string {
  return iso.slice(11, 16);
}

function formatDateLabel(iso: string, today: string, tomorrow: string): string {
  const dateStr = iso.slice(0, 10);
  if (dateStr === today) return "Danas";
  if (dateStr === tomorrow) return "Sutra";
  const [y, mo, dd] = dateStr.split("-").map(Number);
  const d = new Date(y, mo - 1, dd);
  return `${DAYS_SR[d.getDay()]}, ${dd}. ${MONTHS_SR[d.getMonth()]}`;
}

function toSearchResult(
  r: PlatformSearchResult,
  today: string,
  tomorrow: string,
): SearchResult {
  const startTime = r.slot.startTime;
  return {
    salonId: r.salon.id,
    salonName: r.salon.name,
    serviceId: r.service?.id ?? null,
    serviceName: r.service?.name ?? "Slobodan termin",
    category: r.service?.slug ?? "",
    startTime,
    city: r.salon.city,
    distanceKm: r.distanceKm ?? undefined,
    price: (r.service?.price ?? 0) > 0 ? (r.service!.price as number) : undefined,
    salonSlug: r.salon.slug ?? undefined,
    salonLogo: r.salon.logo ?? undefined,
    salonLat: r.salon.lat ?? undefined,
    salonLng: r.salon.lng ?? undefined,
    serviceDuration: r.service?.duration ?? undefined,
    endTime: r.slot.endTime,
    dateLabel: formatDateLabel(startTime, today, tomorrow),
    timeLabel: formatTimeLabel(startTime),
    relevanceScore: 1000 - (r.fallbackLevel || 0) * 100,
    fallbackLevel: r.fallbackLevel || 0,
    isSynthetic: false,
    availabilityConfidence: "calendar_verified",
    availabilityConfidenceScore: getAvailabilityConfidenceScore("calendar_verified"),
    availabilityType: getAvailabilityType("calendar_verified"),
    slotOrigins: ["real"],
  };
}

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

export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  const categories = await fetchCategories();

  const params = normalizeSearch({
    city: searchParams.get("city") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    subcategory: searchParams.get("subcategory") ?? undefined,
    date: searchParams.get("date") ?? undefined,
    time: searchParams.get("time") ?? undefined,
    timeWindowStart: searchParams.get("timeWindowStart") ?? undefined,
    timeWindowEnd: searchParams.get("timeWindowEnd") ?? undefined,
    lat: searchParams.get("lat") ?? undefined,
    lng: searchParams.get("lng") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    categories,
  });

  const rawQs = Object.fromEntries(new URL(req.url).searchParams);
  console.log("[/api/search] ← raw query:", rawQs);
  console.log("[/api/search] → normalized:", {
    city: params.cityDisplay,
    category: params.category ?? null,
    canonicalCategory: params.canonicalCategory ?? null,
    date: params.date,
    time:
      params.timeWindowStart != null
        ? `${params.timeWindowStart}:00–${params.timeWindowEnd}:00`
        : null,
    lat: params.lat ?? null,
    lng: params.lng ?? null,
    limit: params.limit,
  });

  const today = todayInBelgrade();
  const tomorrow = tomorrowInBelgrade();

  // ─────────────────────────────────────────────────────────────────
  // 1. Category provided → use platform /marketplace/search
  // ─────────────────────────────────────────────────────────────────
  if (params.category) {
    let platformResponse;
    try {
      platformResponse = await platformClient.searchSlots({
        category: params.category,
        city: params.cityDisplay,
        date: params.date,
        time:
          params.requestedHour != null
            ? `${String(params.requestedHour).padStart(2, "0")}:00`
            : undefined,
        lat: params.lat,
        lng: params.lng,
        limit: params.limit,
      });
    } catch (err) {
      console.error("[/api/search] platform error:", err);
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

    let results: SearchResult[] = platformResponse.results.map((r) =>
      toSearchResult(r, today, tomorrow),
    );

    // Client-side subcategory filter (platform /marketplace/search has no subcategory param)
    if (params.subcategoryNorm && results.length > 0) {
      const filtered = results.filter((r) =>
        stripDiacritics(r.serviceName).toLowerCase().includes(params.subcategoryNorm!),
      );
      if (filtered.length > 0) results = filtered;
    }

    const geoRef = geoReference(params);
    const geoResults = enrichGeoSignals({
      slots: results,
      userLat: geoRef.lat,
      userLng: geoRef.lng,
    });

    const slotsByCity = groupAndSortByCityPriority(
      geoResults,
      params.cityDisplay,
      params.cityRef,
    );

    const response: SearchApiResponse = {
      results: geoResults,
      slotsByCity,
      bestSlot: geoResults[0] ?? null,
      fallbackLevel: platformResponse.fallbackLevel,
      totalSalons: (platformResponse.debug["salonsFound"] as number) ?? 0,
      debug: {
        normalizedCity: params.cityDisplay,
        normalizedCategory: params.category ?? null,
        searchDate: params.date,
        timeWindow:
          params.timeWindowStart != null
            ? `${params.timeWindowStart}:00–${params.timeWindowEnd}:00`
            : null,
        timezone: "Europe/Belgrade",
        totalSlotsFound: geoResults.length,
        fallbackUsed: platformResponse.fallbackLabel,
        platform: platformResponse.debug,
      },
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // 2. No category → fetch ALL salons + 6-level fallback engine
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

  const slotsByCity = groupAndSortByCityPriority(
    geoResults,
    params.cityDisplay,
    params.cityRef,
  );

  const response: SearchApiResponse = {
    results: geoResults,
    slotsByCity,
    bestSlot: geoResults[0] ?? null,
    fallbackLevel,
    totalSalons: salons.length,
    debug: {
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

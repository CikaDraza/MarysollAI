/**
 * GET /api/search
 *
 * Ako je zadata kategorija → prosleđuje platformi `/marketplace/search`.
 * Ako nema kategorije → dohvata SVE salone i koristi findBestSlots (fallback uključuje i druge gradove).
 */

import { NextResponse } from "next/server";
import {
  platformClient,
  type PlatformSearchResult,
  type PlatformSalon,
} from "@/lib/api/platformClient";
import {
  normalizeSearch,
  todayInBelgrade,
  tomorrowInBelgrade,
} from "@/lib/search/normalizeSearch";
import { findBestSlots } from "@/lib/search/findBestSlots";
import type { SearchApiResponse, SearchResult } from "@/types/slots";

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

function formatDateLabel(iso: string, today: string, tomorrow: string): string {
  const dateStr = iso.slice(0, 10);
  if (dateStr === today) return "Danas";
  if (dateStr === tomorrow) return "Sutra";
  const d = new Date(iso);
  return `${DAYS_SR[d.getDay()]}, ${d.getDate()}. ${MONTHS_SR[d.getMonth()]}`;
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
    price: r.service?.price ?? undefined,
    salonSlug: r.salon.slug ?? undefined,
    salonLogo: r.salon.logo ?? undefined,
    serviceDuration: r.service?.duration ?? undefined,
    endTime: r.slot.endTime,
    dateLabel: formatDateLabel(startTime, today, tomorrow),
    timeLabel: formatTimeLabel(startTime),
    relevanceScore: 1000 - (r.fallbackLevel || 0) * 100,
    fallbackLevel: r.fallbackLevel || 0,
    isSynthetic: false,
  };
}

export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  const params = normalizeSearch({
    city: searchParams.get("city") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    subcategory: searchParams.get("subcategory") ?? undefined,
    date: searchParams.get("date") ?? undefined,
    time: searchParams.get("time") ?? undefined,
    lat: searchParams.get("lat") ?? undefined,
    lng: searchParams.get("lng") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  console.log("[/api/search] →", {
    city: params.cityDisplay,
    category: params.category ?? null,
    date: params.date,
    time:
      params.timeWindowStart != null
        ? `${params.timeWindowStart}:00–${params.timeWindowEnd}:00`
        : null,
  });

  const today = todayInBelgrade();
  const tomorrow = tomorrowInBelgrade();

  // ─────────────────────────────────────────────────────────────────
  // 1. Ako postoji kategorija → koristi platformin /marketplace/search
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

    const results: SearchResult[] = platformResponse.results.map((r) =>
      toSearchResult(r, today, tomorrow),
    );

    const cityMap = new Map<string, SearchResult[]>();
    for (const r of results) {
      if (!r.city) continue;
      const bucket = cityMap.get(r.city) ?? [];
      bucket.push(r);
      cityMap.set(r.city, bucket);
    }

    const sortedCities = [...cityMap.keys()].sort((a, b) => {
      const dA = cityMap.get(a)?.[0]?.distanceKm ?? Infinity;
      const dB = cityMap.get(b)?.[0]?.distanceKm ?? Infinity;
      return dA - dB;
    });

    const slotsByCity = sortedCities.slice(0, 3).map((city) => ({
      city,
      slots: (cityMap.get(city) ?? []).slice(0, 5),
    }));

    const response: SearchApiResponse = {
      results,
      slotsByCity,
      bestSlot: results[0] ?? null,
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
        totalSlotsFound: results.length,
        fallbackUsed: platformResponse.fallbackLabel,
        platform: platformResponse.debug,
      },
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // 2. Nema kategorije → dohvati SVE salone (bez city filtera)
  // ─────────────────────────────────────────────────────────────────
  let salons: PlatformSalon[] = [];
  try {
    // Ne šaljemo city parametar – dobijamo sve salone (ili one u blizini ako imamo lat/lng)
    salons = await platformClient.getSalonProfiles({
      lat: params.lat,
      lng: params.lng,
      // city: NIJE definisan – svi gradovi
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

  // Ograniči broj salona (npr. prvih 30) radi performansi
  if (salons.length > 30) salons = salons.slice(0, 30);

  const { results, fallbackLevel, fallbackLabel } = findBestSlots(
    salons,
    params,
  );

  // Grupisanje po gradu
  const cityMap = new Map<string, SearchResult[]>();
  for (const r of results) {
    if (!r.city) continue;
    const bucket = cityMap.get(r.city) ?? [];
    bucket.push(r);
    cityMap.set(r.city, bucket);
  }

  // Sortiranje gradova po udaljenosti (ako imamo referentni grad iz params)
  const sortedCities = [...cityMap.keys()].sort((a, b) => {
    if (!params.cityRef) return 0;
    const cityAcoords = SERBIAN_CITIES.find((c) => c.name === a);
    const cityBcoords = SERBIAN_CITIES.find((c) => c.name === b);
    if (!cityAcoords || !cityBcoords) return 0;
    const distA = haversineKm(
      params.cityRef.lat,
      params.cityRef.lng,
      cityAcoords.lat,
      cityAcoords.lng,
    );
    const distB = haversineKm(
      params.cityRef.lat,
      params.cityRef.lng,
      cityBcoords.lat,
      cityBcoords.lng,
    );
    return distA - distB;
  });

  const slotsByCity = sortedCities.slice(0, 3).map((city) => ({
    city,
    slots: (cityMap.get(city) ?? []).slice(0, 5),
  }));

  const response: SearchApiResponse = {
    results,
    slotsByCity,
    bestSlot: results[0] ?? null,
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
      totalSlotsFound: results.length,
      fallbackUsed: fallbackLabel,
    },
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}

// Dodaj na vrh fajla (posle importa):
import { SERBIAN_CITIES, haversineKm } from "@/lib/cities";

/**
 * GET /api/search
 *
 * Thin adapter over the platform's /marketplace/search endpoint.
 * All filtering, category resolution, and fallback logic is in the platform.
 * This layer only: normalizes input, calls platform, shapes SearchApiResponse.
 *
 * NO JS filtering of salon lists.
 * NO fake/fallback slots.
 * NO getSalonProfiles() + memory scan.
 */

import { NextResponse } from "next/server";
import { platformClient, type PlatformSearchResult } from "@/lib/api/platformClient";
import { normalizeSearch, todayInBelgrade, tomorrowInBelgrade } from "@/lib/search/normalizeSearch";
import type { SearchApiResponse, SearchResult } from "@/types/slots";

const MONTHS_SR = ["jan","feb","mar","apr","maj","jun","jul","avg","sep","okt","nov","dec"];
const DAYS_SR   = ["Ned","Pon","Uto","Sre","Čet","Pet","Sub"];

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
  if (dateStr === today)    return "Danas";
  if (dateStr === tomorrow) return "Sutra";
  const d = new Date(iso);
  return `${DAYS_SR[d.getDay()]}, ${d.getDate()}. ${MONTHS_SR[d.getMonth()]}`;
}

function toSearchResult(r: PlatformSearchResult, today: string, tomorrow: string): SearchResult {
  const startTime = r.slot.startTime;
  return {
    // FlatSlot fields (backward compat)
    salonId:     r.salon.id,
    salonName:   r.salon.name,
    serviceId:   r.service?.id ?? null,
    serviceName: r.service?.name ?? "Slobodan termin",
    category:    r.service?.slug ?? "",
    startTime,
    city:        r.salon.city,
    distanceKm:  r.distanceKm ?? undefined,
    price:       r.service?.price ?? undefined,
    // SearchResult extras
    salonSlug:       r.salon.slug ?? undefined,
    salonLogo:       r.salon.logo ?? undefined,
    serviceDuration: r.service?.duration ?? undefined,
    endTime:         r.slot.endTime,
    dateLabel:       formatDateLabel(startTime, today, tomorrow),
    timeLabel:       formatTimeLabel(startTime),
    relevanceScore:  1000 - r.fallbackLevel * 100,
    fallbackLevel:   r.fallbackLevel,
    isSynthetic:     false,
  };
}

export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  const params = normalizeSearch({
    city:        searchParams.get("city")        ?? undefined,
    category:    searchParams.get("category")    ?? undefined,
    subcategory: searchParams.get("subcategory") ?? undefined,
    date:        searchParams.get("date")        ?? undefined,
    time:        searchParams.get("time")        ?? undefined,
    lat:         searchParams.get("lat")         ?? undefined,
    lng:         searchParams.get("lng")         ?? undefined,
    limit:       searchParams.get("limit")       ?? undefined,
  });

  console.log("[/api/search] →", {
    city: params.cityDisplay,
    category: params.category ?? null,
    date: params.date,
    time: params.timeWindowStart != null
      ? `${params.timeWindowStart}:00–${params.timeWindowEnd}:00`
      : null,
  });

  let platformResponse;
  try {
    platformResponse = await platformClient.searchSlots({
      category: params.canonicalCategory ?? params.category,
      city:     params.cityDisplay,
      date:     params.date,
      time:     params.requestedHour != null
        ? `${String(params.requestedHour).padStart(2, "0")}:00`
        : undefined,
      lat:      params.lat,
      lng:      params.lng,
      limit:    params.limit,
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

  const today    = todayInBelgrade();
  const tomorrow = tomorrowInBelgrade();

  const results: SearchResult[] = platformResponse.results.map((r) =>
    toSearchResult(r, today, tomorrow),
  );

  // Group by city — top 2 cities nearest to requested city
  const cityMap = new Map<string, SearchResult[]>();
  for (const r of results) {
    if (!r.city) continue;
    const bucket = cityMap.get(r.city) ?? [];
    bucket.push(r);
    cityMap.set(r.city, bucket);
  }

  // Sort cities by closest to requested (using distanceKm on first slot of each city)
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
    totalSalons: platformResponse.debug["salonsFound"] as number ?? 0,
    debug: {
      normalizedCity:     params.cityDisplay,
      normalizedCategory: params.category ?? null,
      searchDate:         params.date,
      timeWindow:         params.timeWindowStart != null
        ? `${params.timeWindowStart}:00–${params.timeWindowEnd}:00`
        : null,
      timezone:           "Europe/Belgrade",
      totalSlotsFound:    results.length,
      fallbackUsed:       platformResponse.fallbackLabel,
      platform:           platformResponse.debug,
    },
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}

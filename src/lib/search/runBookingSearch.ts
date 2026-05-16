import { GET as searchGET } from "@/app/api/search/route";
import type { StructuredBookingIntent } from "@/types/intent";
import type { SearchApiResponse } from "@/types/slots";

export type BookingSearchResult = SearchApiResponse;

export async function runBookingSearch(
  intent: StructuredBookingIntent,
): Promise<BookingSearchResult> {
  const qs = new URLSearchParams();
  const city = intent.requestedCity ?? intent.city;
  const query = intent.service ?? intent.category ?? "";

  if (city) qs.set("city", city);
  if (query) qs.set("query", query);
  if (intent.service) qs.set("service", intent.service);
  if (intent.category) qs.set("category", intent.category);
  if (intent.subcategory) qs.set("subcategory", intent.subcategory);
  if (intent.date) qs.set("date", intent.date);
  if (intent.timeWindowStart != null) {
    qs.set("timeWindowStart", String(intent.timeWindowStart));
    if (intent.timeWindowEnd != null) {
      qs.set("timeWindowEnd", String(intent.timeWindowEnd));
    }
  } else if (intent.time) {
    qs.set("time", intent.time);
  } else if (intent.earliestTime) {
    const hour = Number(intent.earliestTime.slice(0, 2));
    if (!Number.isNaN(hour)) {
      qs.set("timeWindowStart", String(hour));
      if (intent.latestTime) {
        const latestHour = Number(intent.latestTime.slice(0, 2));
        if (!Number.isNaN(latestHour)) qs.set("timeWindowEnd", String(latestHour));
      }
    } else {
      qs.set("time", intent.earliestTime);
    }
  }
  qs.set("limit", "50");

  const req = new Request(`http://internal.local/api/search?${qs.toString()}`);
  const res = await searchGET(req);
  if (!res.ok) {
    throw new Error(`booking search failed: ${res.status}`);
  }

  return (await res.json()) as BookingSearchResult;
}

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
  if (intent.earliestTime) {
    const hour = Number(intent.earliestTime.slice(0, 2));
    if (!Number.isNaN(hour)) {
      qs.set("timeWindowStart", String(hour));
      qs.set("timeWindowEnd", "23");
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

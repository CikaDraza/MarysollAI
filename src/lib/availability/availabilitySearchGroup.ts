import { normalizeWatchText } from "@/lib/availability/availabilityWatchDedupe";

export interface AvailabilitySearchGroupKeyInput {
  city: string;
  serviceId?: string;
  serviceName: string;
  category?: string;
  preferredDate?: string;
  timeWindowStart?: number;
  timeWindowEnd?: number;
  salonId?: string;
}

/**
 * Builds a stable key for watches that would issue an equivalent booking
 * search. Watches sharing a key can be served by a single runBookingSearch
 * call; per-watch slot matching still runs individually afterwards.
 *
 * Service identity prefers serviceId (exact) and falls back to a normalized
 * serviceName so case/diacritic variants of the same service collapse together
 * — the same equivalence the dedupe key already relies on.
 */
export function getAvailabilitySearchGroupKey(
  input: AvailabilitySearchGroupKeyInput,
): string {
  const service = input.serviceId
    ? `sid:${input.serviceId.trim()}`
    : `sname:${normalizeWatchText(input.serviceName)}`;

  return [
    `city:${normalizeWatchText(input.city)}`,
    service,
    input.category ? `cat:${normalizeWatchText(input.category)}` : "",
    input.preferredDate ? `date:${input.preferredDate}` : "",
    input.timeWindowStart != null ? `ws:${input.timeWindowStart}` : "",
    input.timeWindowEnd != null ? `we:${input.timeWindowEnd}` : "",
    input.salonId ? `salon:${input.salonId.trim()}` : "",
  ]
    .filter(Boolean)
    .join("|");
}

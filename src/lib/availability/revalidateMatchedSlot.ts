import { runBookingSearch } from "@/lib/search/runBookingSearch";
import type { SearchResult } from "@/types/slots";

export interface RevalidationResult {
  available: boolean;
  reason?: "slot_taken" | "slot_missing" | "salon_missing" | "unknown";
  slot?: SearchResult;
}

export interface RevalidationInput {
  salonId?: string | null;
  serviceId?: string | null;
  serviceName: string;
  startTime?: string | null;
  city: string;
  category?: string | null;
  preferredDate?: string | null;
  timeWindowStart?: number | null;
  timeWindowEnd?: number | null;
}

/** Returns true when a search result matches the original slot exactly. */
export function isSlotStillPresent(
  slots: SearchResult[],
  targetStartTime: string,
  targetSalonId?: string | null,
): boolean {
  return slots.some((s) => {
    if (targetSalonId && s.salonId !== targetSalonId) return false;
    return s.startTime === targetStartTime;
  });
}

/**
 * Re-runs a targeted search for the specific slot to check current
 * availability. Returns the live SearchResult if still bookable.
 */
export async function revalidateMatchedSlot(
  input: RevalidationInput,
): Promise<RevalidationResult> {
  if (!input.startTime) return { available: false, reason: "slot_missing" };
  if (!input.salonId) return { available: false, reason: "salon_missing" };

  const slotDate = input.startTime.slice(0, 10);

  try {
    const search = await runBookingSearch({
      city: input.city,
      service: input.serviceName,
      serviceName: input.serviceName,
      category: input.category ?? undefined,
      serviceId: input.serviceId ?? undefined,
      salonId: input.salonId,
      date: slotDate,
      timeWindowStart: input.timeWindowStart ?? null,
      timeWindowEnd: input.timeWindowEnd ?? null,
    });

    const slots = search.results ?? [];
    const live = slots.find(
      (s) => s.salonId === input.salonId && s.startTime === input.startTime,
    );

    if (live) return { available: true, slot: live };
    return { available: false, reason: "slot_taken" };
  } catch {
    return { available: false, reason: "unknown" };
  }
}

/**
 * Searches for alternative slots using the watch's broader criteria
 * (city + service, not pinned to a specific salon/time).
 */
export async function findAlternativeSlots(
  input: Pick<
    RevalidationInput,
    | "city"
    | "serviceName"
    | "category"
    | "preferredDate"
    | "timeWindowStart"
    | "timeWindowEnd"
  >,
  limit = 5,
): Promise<SearchResult[]> {
  try {
    const search = await runBookingSearch({
      city: input.city,
      service: input.serviceName,
      serviceName: input.serviceName,
      category: input.category ?? undefined,
      date: input.preferredDate ?? undefined,
      timeWindowStart: input.timeWindowStart ?? null,
      timeWindowEnd: input.timeWindowEnd ?? null,
    });
    return (search.results ?? []).slice(0, limit);
  } catch {
    return [];
  }
}

import { AvailabilityWatch } from "@/lib/models/AvailabilityWatch";
import type { IAvailabilityWatchDoc } from "@/lib/models/AvailabilityWatch";
import { notifyAvailabilityWatch } from "@/lib/availability/notifyAvailabilityWatch";
import { computeNextAvailabilityCheckAt } from "@/lib/availability/availabilityCheckSchedule";
import type { BookingSearchResult } from "@/lib/search/runBookingSearch";
import type { SearchResult } from "@/types/slots";

/** Maximum notification attempts before marking a watch failed. */
const MAX_NOTIFY_ATTEMPTS = 3;

export type WatchMatchOutcome =
  | { kind: "matched"; id: string }
  | { kind: "no_match"; id: string }
  | { kind: "error"; id: string; error: string };

export function pickMatchingSlot(
  slots: SearchResult[],
  watch: Pick<
    IAvailabilityWatchDoc,
    "salonId" | "preferredDate" | "timeWindowStart" | "timeWindowEnd"
  >,
): SearchResult | null {
  return (
    slots.find((slot) => {
      if (watch.salonId && slot.salonId !== watch.salonId) return false;
      if (
        watch.preferredDate &&
        slot.startTime.slice(0, 10) !== watch.preferredDate
      )
        return false;
      const hour = new Date(slot.startTime).getHours();
      if (watch.timeWindowStart != null && hour < watch.timeWindowStart)
        return false;
      if (watch.timeWindowEnd != null && hour > watch.timeWindowEnd)
        return false;
      return true;
    }) ?? null
  );
}

/**
 * Records a check that produced no actionable match: stamps lastCheckedAt,
 * schedules the next check based on preferredDate, and releases the lock.
 */
export async function releaseWatchWithBackoff(params: {
  watch: IAvailabilityWatchDoc;
  now: Date;
}): Promise<void> {
  const { watch, now } = params;
  const nextCheckAt = computeNextAvailabilityCheckAt({
    now,
    preferredDate: watch.preferredDate,
  });
  await AvailabilityWatch.updateOne(
    { _id: watch._id },
    {
      $set: { lastCheckedAt: now, nextCheckAt },
      $unset: { notificationLock: "" },
    },
  );
}

/**
 * Matches a single claimed watch against an already-fetched search result and
 * advances its state (matched / notified / failed / no-match). The watch must
 * already hold the notification lock; this releases it in every branch.
 *
 * Idempotency is preserved: status only advances forward, and notification is
 * skipped when notifiedAt is already set.
 */
export async function processWatchMatch(params: {
  watch: IAvailabilityWatchDoc;
  search: BookingSearchResult;
  now: Date;
}): Promise<WatchMatchOutcome> {
  const { watch, search, now } = params;
  const id = String(watch._id);

  const slot = pickMatchingSlot(search.results ?? [], watch);

  if (!slot) {
    // No match yet — record check time, schedule next check, release lock.
    await releaseWatchWithBackoff({ watch, now });
    return { kind: "no_match", id };
  }

  // Mark matched before attempting notification.
  await AvailabilityWatch.updateOne(
    { _id: watch._id },
    {
      $set: {
        matchedSlot: slot,
        status: "matched",
        matchedAt: now,
        lastCheckedAt: now,
      },
    },
  );

  // Guard: skip if already notified (idempotency for retried cron runs).
  const fresh = await AvailabilityWatch.findOne(
    { _id: watch._id, notifiedAt: { $exists: false } },
    { _id: 1, notificationAttempts: 1 },
  ).lean();

  if (!fresh) {
    console.log("[WATCH_NOTIFY_SKIPPED_ALREADY_NOTIFIED]", id);
    await AvailabilityWatch.updateOne(
      { _id: watch._id },
      { $unset: { notificationLock: "" } },
    );
    return { kind: "matched", id };
  }

  try {
    await notifyAvailabilityWatch(watch, slot);

    await AvailabilityWatch.updateOne(
      { _id: watch._id },
      {
        $set: { status: "notified", notifiedAt: now },
        $unset: { notificationLock: "" },
      },
    );
    return { kind: "matched", id };
  } catch (notifyErr) {
    const attempts = (fresh.notificationAttempts ?? 0) + 1;
    const errMsg =
      notifyErr instanceof Error
        ? notifyErr.message
        : "Unknown notification error";

    await AvailabilityWatch.updateOne(
      { _id: watch._id },
      {
        $set: {
          notificationAttempts: attempts,
          lastNotificationError: errMsg,
          ...(attempts >= MAX_NOTIFY_ATTEMPTS ? { status: "failed" } : {}),
        },
        $unset: { notificationLock: "" },
      },
    );
    return { kind: "error", id, error: errMsg };
  }
}

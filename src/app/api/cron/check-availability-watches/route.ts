// Availability-watch cron.
//
// Scheduling: vercel.json registers this path on a */15 cron. Vercel invokes
// the PRODUCTION GET endpoint with the CRON_SECRET bearer token.
//
// Idempotency: each watch is claimed with an atomic findOneAndUpdate before any
// side-effecting work. If a run crashes mid-flight the lock expires after
// LOCK_TTL_MS so the next cron run can reclaim the watch. Status advances
// strictly forward (active → matched → notified / failed) so duplicate runs
// are safe.
//
// TODO: add a single per-job lock (e.g. short-lived mongo doc) to prevent two
// overlapping cron runs from fetching the same batch simultaneously.
import { NextResponse } from "next/server";
import crypto from "crypto";
import { connectToDB } from "@/lib/db/mongodb";
import { notifyAvailabilityWatch } from "@/lib/availability/notifyAvailabilityWatch";
import { AvailabilityWatch } from "@/lib/models/AvailabilityWatch";
import { runBookingSearch } from "@/lib/search/runBookingSearch";
import type { SearchResult } from "@/types/slots";

export const dynamic = "force-dynamic";

/** Lock expires after 10 minutes — prevents permanent stuck locks. */
const LOCK_TTL_MS = 10 * 60 * 1000;
/** Maximum notification attempts before marking a watch failed. */
const MAX_NOTIFY_ATTEMPTS = 3;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function pickMatchingSlot(
  slots: SearchResult[],
  watch: {
    salonId?: string;
    preferredDate?: string;
    timeWindowStart?: number;
    timeWindowEnd?: number;
  },
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

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDB();

  const now = new Date();

  // Expire stale watches.
  await AvailabilityWatch.updateMany(
    { status: "active", expiresAt: { $lte: now } },
    { $set: { status: "expired", lastCheckedAt: now } },
  );

  const limitParam = new URL(req.url).searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 200);
  const lockExpiryCutoff = new Date(now.getTime() - LOCK_TTL_MS);
  const lockId = crypto.randomUUID();

  // Only fetch watches we can actually claim (no lock, or expired lock).
  const candidates = await AvailabilityWatch.find({
    status: "active",
    expiresAt: { $gt: now },
    $or: [
      { notificationLock: { $exists: false } },
      { "notificationLock.lockedAt": { $lte: lockExpiryCutoff } },
    ],
  })
    .sort({ lastCheckedAt: 1, createdAt: 1 })
    .limit(limit)
    .select("_id");

  const matched: string[] = [];
  const errors: { id: string; error: string }[] = [];

  for (const { _id } of candidates) {
    // Atomically claim the watch. Skips if another cron already claimed it.
    const watch = await AvailabilityWatch.findOneAndUpdate(
      {
        _id,
        status: "active",
        expiresAt: { $gt: now },
        $or: [
          { notificationLock: { $exists: false } },
          { "notificationLock.lockedAt": { $lte: lockExpiryCutoff } },
        ],
      },
      {
        $set: {
          notificationLock: { lockedAt: now, lockId },
        },
      },
      { new: true },
    );

    if (!watch) continue; // Lost the claim race — skip.

    try {
      const search = await runBookingSearch({
        city: watch.city,
        service: watch.serviceName,
        serviceId: watch.serviceId,
        serviceName: watch.serviceName,
        category: watch.category,
        salonId: watch.salonId,
        salonName: watch.salonName,
        date: watch.preferredDate,
        timeWindowStart: watch.timeWindowStart ?? null,
        timeWindowEnd: watch.timeWindowEnd ?? null,
        availabilityPreference: "prefer_verified",
      });

      const slot = pickMatchingSlot(search.results ?? [], watch);

      if (!slot) {
        // No match yet — record check time, release lock.
        await AvailabilityWatch.updateOne(
          { _id: watch._id },
          {
            $set: { lastCheckedAt: now },
            $unset: { notificationLock: "" },
          },
        );
        continue;
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
        console.log("[WATCH_NOTIFY_SKIPPED_ALREADY_NOTIFIED]", String(watch._id));
        await AvailabilityWatch.updateOne(
          { _id: watch._id },
          { $unset: { notificationLock: "" } },
        );
        matched.push(String(watch._id));
        continue;
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
        matched.push(String(watch._id));
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
        errors.push({ id: String(watch._id), error: errMsg });
      }
    } catch (err) {
      // Search or outer error — release lock, record check time.
      const errMsg =
        err instanceof Error ? err.message : "Unknown error";
      await AvailabilityWatch.updateOne(
        { _id: watch._id },
        {
          $set: { lastCheckedAt: now },
          $unset: { notificationLock: "" },
        },
      );
      errors.push({ id: String(watch._id), error: errMsg });
    }
  }

  return NextResponse.json({
    checked: candidates.length,
    matched: matched.length,
    matchedIds: matched,
    errors,
  });
}

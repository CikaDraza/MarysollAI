// Availability-watch cron.
//
// Scheduling: vercel.json registers this path on a */5 cron. Vercel invokes
// the PRODUCTION GET endpoint with the CRON_SECRET bearer token.
//
// Idempotency: each watch is claimed with an atomic findOneAndUpdate before any
// side-effecting work. If a run crashes mid-flight the lock expires after
// LOCK_TTL_MS so the next cron run can reclaim the watch. Status advances
// strictly forward (active → matched → notified / failed) so duplicate runs
// are safe.
//
// M0/serverless efficiency: candidates are filtered to watches that are due
// (nextCheckAt) and claimable (lock), then grouped by equivalent search intent
// so runBookingSearch is called once per group instead of once per watch.
//
// TODO: add a single per-job lock (e.g. short-lived mongo doc) to prevent two
// overlapping cron runs from fetching the same batch simultaneously.
import { NextResponse } from "next/server";
import crypto from "crypto";
import type { FilterQuery } from "mongoose";
import { connectToDB } from "@/lib/db/mongodb";
import { AvailabilityWatch } from "@/lib/models/AvailabilityWatch";
import type { IAvailabilityWatchDoc } from "@/lib/models/AvailabilityWatch";
import { runBookingSearch } from "@/lib/search/runBookingSearch";
import type { BookingSearchResult } from "@/lib/search/runBookingSearch";
import { getAvailabilitySearchGroupKey } from "@/lib/availability/availabilitySearchGroup";
import {
  processWatchMatch,
  releaseWatchWithBackoff,
} from "@/lib/availability/processAvailabilityWatchMatch";

export const dynamic = "force-dynamic";

/** Lock expires after 10 minutes — prevents permanent stuck locks. */
const LOCK_TTL_MS = 10 * 60 * 1000;
/** Default number of watches processed per cron run. */
const DEFAULT_LIMIT = 20;
/** Upper bound for the `?limit=` override. */
const MAX_LIMIT = 50;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/** Parses `?limit=`, falling back to DEFAULT_LIMIT for invalid input. */
function parseLimit(rawUrl: string): number {
  const limitParam = new URL(rawUrl).searchParams.get("limit");
  const parsed = Number(limitParam);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(parsed), 1), MAX_LIMIT);
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

  const limit = parseLimit(req.url);
  const lockExpiryCutoff = new Date(now.getTime() - LOCK_TTL_MS);
  const lockId = crypto.randomUUID();

  // Match clause: active, not expired, due (no nextCheckAt or it has passed),
  // and claimable (no lock or an expired lock). Reused for the atomic claim.
  const claimableFilter: FilterQuery<IAvailabilityWatchDoc> = {
    status: "active",
    expiresAt: { $gt: now },
    $and: [
      {
        $or: [
          { nextCheckAt: { $exists: false } },
          { nextCheckAt: { $lte: now } },
        ],
      },
      {
        $or: [
          { notificationLock: { $exists: false } },
          { "notificationLock.lockedAt": { $lte: lockExpiryCutoff } },
        ],
      },
    ],
  };

  const candidates = await AvailabilityWatch.find(claimableFilter)
    .sort({ nextCheckAt: 1, lastCheckedAt: 1, createdAt: 1 })
    .limit(limit)
    .select("_id");

  console.log("[WATCH_CRON_CANDIDATES]", candidates.length);

  // Atomically claim each candidate before any side-effecting work. Keep only
  // the watches we successfully claimed (others were taken by a parallel run).
  const claimed: IAvailabilityWatchDoc[] = [];
  for (const { _id } of candidates) {
    const watch = await AvailabilityWatch.findOneAndUpdate(
      { _id, ...claimableFilter },
      { $set: { notificationLock: { lockedAt: now, lockId } } },
      { new: true },
    );
    if (watch) claimed.push(watch);
  }

  console.log("[WATCH_CRON_CLAIMED]", claimed.length);

  // Group claimed watches by equivalent search intent so we issue one
  // runBookingSearch per group rather than one per watch.
  const groups = new Map<string, IAvailabilityWatchDoc[]>();
  for (const watch of claimed) {
    const key = getAvailabilitySearchGroupKey({
      city: watch.city,
      serviceId: watch.serviceId,
      serviceName: watch.serviceName,
      category: watch.category,
      preferredDate: watch.preferredDate,
      timeWindowStart: watch.timeWindowStart,
      timeWindowEnd: watch.timeWindowEnd,
      salonId: watch.salonId,
    });
    const bucket = groups.get(key);
    if (bucket) bucket.push(watch);
    else groups.set(key, [watch]);
  }

  console.log("[WATCH_CRON_GROUPS]", groups.size);

  const matched: string[] = [];
  const errors: { id: string; error: string }[] = [];
  let searchCalls = 0;

  for (const group of groups.values()) {
    const lead = group[0];

    let search: BookingSearchResult;
    try {
      // One search per group, using the first watch as the representative input.
      search = await runBookingSearch({
        city: lead.city,
        service: lead.serviceName,
        serviceId: lead.serviceId,
        serviceName: lead.serviceName,
        category: lead.category,
        salonId: lead.salonId,
        salonName: lead.salonName,
        date: lead.preferredDate,
        timeWindowStart: lead.timeWindowStart ?? null,
        timeWindowEnd: lead.timeWindowEnd ?? null,
        availabilityPreference: "prefer_verified",
      });
      searchCalls += 1;
    } catch (err) {
      // Search failed for the whole group — release each watch with backoff.
      const errMsg =
        err instanceof Error ? err.message : "Unknown search error";
      for (const watch of group) {
        await releaseWatchWithBackoff({ watch, now });
        errors.push({ id: String(watch._id), error: errMsg });
      }
      continue;
    }

    // Each watch is still matched and updated individually.
    for (const watch of group) {
      try {
        const outcome = await processWatchMatch({ watch, search, now });
        if (outcome.kind === "matched") matched.push(outcome.id);
        else if (outcome.kind === "error")
          errors.push({ id: outcome.id, error: outcome.error });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        await releaseWatchWithBackoff({ watch, now });
        errors.push({ id: String(watch._id), error: errMsg });
      }
    }
  }

  console.log(
    "[WATCH_CRON_DONE]",
    JSON.stringify({
      candidates: candidates.length,
      claimed: claimed.length,
      groups: groups.size,
      searchCalls,
      matched: matched.length,
      errors: errors.length,
    }),
  );

  return NextResponse.json({
    checked: candidates.length,
    claimed: claimed.length,
    groups: groups.size,
    searchCalls,
    matched: matched.length,
    matchedIds: matched,
    errors,
  });
}

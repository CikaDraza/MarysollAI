import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db/mongodb";
import { notifyAvailabilityWatch } from "@/lib/availability/notifyAvailabilityWatch";
import { AvailabilityWatch } from "@/lib/models/AvailabilityWatch";
import { runBookingSearch } from "@/lib/search/runBookingSearch";
import type { SearchResult } from "@/types/slots";

export const dynamic = "force-dynamic";

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
      if (watch.preferredDate && slot.startTime.slice(0, 10) !== watch.preferredDate) {
        return false;
      }
      const hour = new Date(slot.startTime).getHours();
      if (watch.timeWindowStart != null && hour < watch.timeWindowStart) return false;
      if (watch.timeWindowEnd != null && hour > watch.timeWindowEnd) return false;
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
  await AvailabilityWatch.updateMany(
    { status: "active", expiresAt: { $lte: now } },
    { $set: { status: "expired", lastCheckedAt: now } },
  );

  const limitParam = new URL(req.url).searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 200);
  const watches = await AvailabilityWatch.find({
    status: "active",
    expiresAt: { $gt: now },
  })
    .sort({ lastCheckedAt: 1, createdAt: 1 })
    .limit(limit);

  const matched: string[] = [];
  const errors: { id: string; error: string }[] = [];

  for (const watch of watches) {
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
        watch.lastCheckedAt = now;
        await watch.save();
        continue;
      }

      watch.matchedSlot = slot;
      watch.status = "matched";
      watch.lastCheckedAt = now;
      await watch.save();

      await notifyAvailabilityWatch(watch, slot);

      watch.status = "notified";
      watch.notifiedAt = new Date();
      await watch.save();
      matched.push(String(watch._id));
    } catch (err) {
      errors.push({
        id: String(watch._id),
        error: err instanceof Error ? err.message : "Unknown error",
      });
      await AvailabilityWatch.updateOne(
        { _id: watch._id },
        { $set: { lastCheckedAt: new Date() } },
      );
    }
  }

  return NextResponse.json({
    checked: watches.length,
    matched: matched.length,
    matchedIds: matched,
    errors,
  });
}

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDB } from "@/lib/db/mongodb";
import { AvailabilityWatch } from "@/lib/models/AvailabilityWatch";
import {
  revalidateMatchedSlot,
  findAlternativeSlots,
} from "@/lib/availability/revalidateMatchedSlot";
import type { SearchResult } from "@/types/slots";

// Statuses that mean the watch is permanently done — no revalidation possible.
// Note: "failed" is set by the cron but is not in AvailabilityWatchStatus enum;
// we cast to string for the comparison so future additions don't break this guard.
const TERMINAL_STATUSES = new Set<string>(["expired", "cancelled", "failed", "booked"]);

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Nedostaje watch id." }, { status: 400 });
  }

  await connectToDB();
  const watch = await AvailabilityWatch.findById(id).lean();

  if (!watch) {
    return NextResponse.json({ error: "Zahtev nije pronađen." }, { status: 404 });
  }

  const watchId = String(watch._id);

  const watchStatusStr = watch.status as string;
  if (TERMINAL_STATUSES.has(watchStatusStr)) {
    return NextResponse.json(
      { status: watchStatusStr, watchId },
      // 410 Gone for user-visible terminals; 409 for failed (retriable error)
      { status: watchStatusStr === "failed" ? 409 : 410 },
    );
  }

  const matchedSlot = watch.matchedSlot as Partial<SearchResult> | undefined;
  const input = {
    salonId: watch.salonId ?? matchedSlot?.salonId,
    serviceId: watch.serviceId ?? matchedSlot?.serviceId,
    serviceName: watch.serviceName,
    startTime: matchedSlot?.startTime,
    city: watch.city,
    category: watch.category,
    preferredDate: watch.preferredDate,
    timeWindowStart: watch.timeWindowStart ?? null,
    timeWindowEnd: watch.timeWindowEnd ?? null,
  };

  // Always revalidate — never trust the stored matchedSlot blindly.
  const revalidation = await revalidateMatchedSlot(input);

  if (revalidation.available && revalidation.slot) {
    return NextResponse.json({
      status: "available",
      watchId,
      slot: revalidation.slot,
      bookingPayload: revalidation.slot,
    });
  }

  // Slot is gone — find alternatives.
  const alternatives = await findAlternativeSlots(input);

  // Reset watch to active so the cron keeps looking.
  await AvailabilityWatch.updateOne(
    { _id: watch._id },
    {
      $set: { status: "active" },
      $unset: {
        matchedSlot: "",
        matchedAt: "",
        notifiedAt: "",
        notificationLock: "",
      },
    },
  );

  if (alternatives.length > 0) {
    return NextResponse.json({
      status: "alternative_found",
      watchId,
      previousSlot: matchedSlot ?? null,
      alternatives,
    });
  }

  return NextResponse.json({
    status: "no_longer_available",
    watchId,
  });
}

// src/app/api/waitlist/route.ts
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDB } from "@/lib/db/mongodb";
import { getUserFromToken } from "@/lib/auth/auth-utils";
import {
  AvailabilityWatch,
  type IAvailabilityWatch,
  type NotificationChannel,
} from "@/lib/models/AvailabilityWatch";

interface AvailabilityWatchRequest
  extends Partial<
    Omit<IAvailabilityWatch, "status" | "notificationChannels" | "expiresAt">
  > {
  service?: string;
  preferredTimeMode?: "anytime" | "today" | "tomorrow";
  notificationChannels?: NotificationChannel[];
  pushAllowed?: boolean;
  pushSubscription?: IAvailabilityWatch["pushSubscription"];
}

function clean(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getRequestUser(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  return token ? getUserFromToken(token) : null;
}

function buildChannels(params: {
  email?: string;
  clientId?: string;
  pushAllowed?: boolean;
}): NotificationChannel[] {
  const channels = new Set<NotificationChannel>();
  if (params.email) channels.add("email");
  if (params.clientId) channels.add("in_app");
  if (params.pushAllowed) channels.add("push");
  return [...channels];
}

export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Nedostaje watch id." }, { status: 400 });
    }

    await connectToDB();
    const watch = await AvailabilityWatch.findById(id).lean();
    if (!watch) {
      return NextResponse.json({ error: "Zahtev nije pronađen." }, { status: 404 });
    }

    return NextResponse.json({
      id: String(watch._id),
      status: watch.status,
      matchedSlot: watch.matchedSlot ?? null,
      serviceName: watch.serviceName,
      city: watch.city,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AvailabilityWatchRequest;
    const user = getRequestUser(req);

    const name = clean(body.name) ?? user?.name;
    const email = clean(body.email) ?? user?.email;
    const phone = clean(body.phone) ?? user?.phone;
    const instagram = clean(body.instagram) ?? user?.instagram;
    const tiktok = clean(body.tiktok);
    const serviceName = clean(body.serviceName) ?? clean(body.service);
    const city = clean(body.city);
    const salonId = clean(body.salonId);
    const salonName = clean(body.salonName);
    const category = clean(body.category);
    const clientId = clean(body.clientId) ?? user?.id;
    const preferredTimeMode = body.preferredTimeMode ?? "anytime";

    if (!serviceName || !city) {
      return NextResponse.json(
        { error: "Usluga i grad su obavezni." },
        { status: 400 },
      );
    }

    const hasAnyContact = Boolean(email || phone || instagram || tiktok);
    if (!clientId && (!name || !hasAnyContact)) {
      return NextResponse.json(
        { error: "Unesite ime i bar jedan kontakt." },
        { status: 400 },
      );
    }

    const preferredDate =
      clean(body.preferredDate) ??
      (preferredTimeMode === "today"
        ? toIsoDate(new Date())
        : preferredTimeMode === "tomorrow"
          ? toIsoDate(addDays(new Date(), 1))
          : undefined);

    const timeWindowStart =
      typeof body.timeWindowStart === "number" ? body.timeWindowStart : undefined;
    const timeWindowEnd =
      typeof body.timeWindowEnd === "number" ? body.timeWindowEnd : undefined;
    const pushSubscription =
      body.pushSubscription?.endpoint ? body.pushSubscription : undefined;
    const channels = body.notificationChannels?.length
      ? body.notificationChannels
      : buildChannels({ email, clientId, pushAllowed: Boolean(pushSubscription) });

    await connectToDB();
    const entry = await AvailabilityWatch.create({
      tenantId: clean(body.tenantId),
      salonId,
      salonName,
      city,
      serviceId: clean(body.serviceId),
      serviceName,
      category,
      preferredDate,
      timeWindowStart,
      timeWindowEnd,
      clientId,
      name,
      email,
      phone,
      instagram,
      tiktok,
      status: "active",
      notificationChannels: channels,
      pushSubscription,
      expiresAt: addDays(new Date(), 14),
    });

    return NextResponse.json(
      {
        id: String(entry._id),
        status: entry.status,
        notificationChannels: entry.notificationChannels,
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save" },
      { status: 500 },
    );
  }
}

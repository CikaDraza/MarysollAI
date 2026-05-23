import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { platformHeaders } from "@/lib/api/platformHeaders";
import { platformClient } from "@/lib/api/platformClient";
import { connectToDB } from "@/lib/db/mongodb";
import { findSalonBySlug } from "@/lib/salons/salonPreview";
import type {
  PublicSalonTestimonial,
  SalonTestimonialsResponse,
} from "@/types/salon-preview";

interface Context {
  params: Promise<{ slug: string }>;
}

interface RawTestimonialsResponse {
  testimonials?: unknown[];
  data?: unknown;
  items?: unknown[];
  results?: unknown[];
  pagination?: { total?: number };
}

const TENANT_ID_BY_SALON_PROFILE_ID: Record<string, string> = {
  // Beauty M Glow: marketplace SalonProfile id differs from Tenant id used by testimonials.
  "69f0d64a749b985062a7c0e5": "69f0d64a749b985062a7c0df",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value instanceof Date) return value.toISOString();
  if (isRecord(value) && typeof value.$oid === "string") return value.$oid;
  if (
    value &&
    typeof value === "object" &&
    value.constructor?.name === "ObjectId"
  ) {
    return String(value);
  }
  return undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function normalizeId(value: unknown): string {
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    value.constructor?.name === "ObjectId"
  ) {
    return String(value);
  }
  if (!isRecord(value)) return "";
  if (typeof value.$oid === "string") return value.$oid;
  const id = value._id ?? value.id;
  return typeof id === "string" ? id : "";
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getTestimonialsSource(value: RawTestimonialsResponse | unknown[]): unknown[] {
  if (Array.isArray(value)) return value;
  return Array.isArray(value.testimonials)
    ? value.testimonials
    : Array.isArray(value.data)
      ? value.data
      : Array.isArray(value.items)
        ? value.items
        : Array.isArray(value.results)
          ? value.results
      : [];
}

function testimonialMatchesSalon(
  item: unknown,
  salon: { id: string; tenantId?: string; name: string },
): boolean {
  if (!isRecord(item)) return false;
  const ids = [
    item.salonId,
    item.tenantId,
    item.salonProfileId,
    item.salonProfile,
    item.tenant,
    readPath(item, ["appointmentId", "salonId"]),
    readPath(item, ["appointmentId", "tenantId"]),
    readPath(item, ["appointment", "salonId"]),
    readPath(item, ["appointment", "tenantId"]),
  ].map(normalizeId);
  if (ids.includes(salon.id)) return true;
  if (salon.tenantId && ids.includes(salon.tenantId)) return true;

  const names = [
    item.salonName,
    item.tenantName,
    readPath(item, ["appointmentId", "salonName"]),
    readPath(item, ["appointmentId", "tenantName"]),
    readPath(item, ["appointment", "salonName"]),
    readPath(item, ["appointment", "tenantName"]),
  ].map(normalizeText);

  return names.includes(normalizeText(salon.name));
}

function normalizeTestimonials(
  value: RawTestimonialsResponse | unknown[],
  salon: { id: string; tenantId?: string; name: string },
): PublicSalonTestimonial[] {
  const source = getTestimonialsSource(value);

  return source
    .filter((item) => testimonialMatchesSalon(item, salon))
    .map((item): PublicSalonTestimonial | null => {
      if (!isRecord(item)) return null;
      const _id = readString(item._id) ?? readString(item.id);
      const clientName = readString(item.clientName) ?? "Klijent";
      const rating = readNumber(item.rating);
      const comment = readString(item.comment);
      if (!_id || rating == null || !comment) return null;
      return {
        _id,
        clientName,
        rating,
        comment,
        adminReply: readString(item.adminReply),
        createdAt: readString(item.createdAt) ?? "",
      };
    })
    .filter((testimonial): testimonial is PublicSalonTestimonial =>
      Boolean(testimonial),
    );
}

async function fetchApprovedTestimonialsFromDb(tenantId?: string) {
  if (!tenantId || !mongoose.Types.ObjectId.isValid(tenantId)) return [];

  await connectToDB();
  const db = mongoose.connection.db;
  if (!db) return [];

  return db
    .collection("testimonials")
    .find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      isApproved: true,
    })
    .sort({ createdAt: -1 })
    .limit(24)
    .toArray();
}

export async function GET(_req: Request, context: Context) {
  const { slug } = await context.params;
  const mainSiteApi = process.env.MAIN_SITE_API;

  if (!mainSiteApi) {
    return NextResponse.json(
      { error: "MAIN_SITE_API nije podešen" },
      { status: 500 },
    );
  }

  try {
    const rawProfiles = await platformClient.getSalonProfiles();
    const rawSalon = findSalonBySlug(rawProfiles, slug);

    if (!rawSalon) {
      return NextResponse.json({ error: "Salon nije pronađen" }, { status: 404 });
    }

    const salonId = rawSalon.id ?? rawSalon._id ?? "";
    const tenantId =
      (salonId ? TENANT_ID_BY_SALON_PROFILE_ID[salonId] : undefined) ??
      (typeof rawSalon.tenantId === "string" ? rawSalon.tenantId : undefined);
    const params = new URLSearchParams({
      page: "1",
      limit: "24",
    });
    if (salonId) params.set("salonId", salonId);
    if (tenantId) params.set("tenantId", tenantId);
    params.set("salonName", rawSalon.name);

    const response = await fetch(`${mainSiteApi}/testimonials/public?${params.toString()}`, {
      headers: platformHeaders(),
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      console.error("[api/salons/[slug]/testimonials] public API failed", {
        status: response.status,
        text,
      });
      return NextResponse.json(
        { testimonials: [], averageRating: null, total: 0 },
        { status: 200 },
      );
    }

    const raw = (await response.json()) as RawTestimonialsResponse;
    let testimonials = normalizeTestimonials(raw, {
      id: salonId,
      tenantId,
      name: rawSalon.name,
    });

    if (testimonials.length === 0) {
      const dbTestimonials = await fetchApprovedTestimonialsFromDb(tenantId);
      testimonials = normalizeTestimonials(dbTestimonials, {
        id: salonId,
        tenantId,
        name: rawSalon.name,
      });
    }
    const total = testimonials.length;
    const averageRating =
      testimonials.length > 0
        ? Math.round(
            (testimonials.reduce((sum, item) => sum + item.rating, 0) /
              testimonials.length) *
              10,
          ) / 10
        : null;

    const payload: SalonTestimonialsResponse = {
      testimonials,
      averageRating,
      total,
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("[api/salons/[slug]/testimonials] failed", error);
    return NextResponse.json(
      { testimonials: [], averageRating: null, total: 0 },
      { status: 200 },
    );
  }
}

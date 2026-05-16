// src/lib/api/platformClient.ts
import { PlatformCategory } from "@/types/category-types";
import crypto from "crypto";

const BASE = (process.env.PLATFORM_API_URL ?? "").replace(/\/$/, "");
const API_KEY = process.env.PLATFORM_API_KEY ?? "";
const API_SECRET = process.env.PLATFORM_API_SECRET ?? "";

function signedHeaders(method: string, body?: object): Record<string, string> {
  const timestamp = Date.now().toString();
  const bodyString = method === "GET" ? "" : JSON.stringify(body ?? {});
  const signature = crypto
    .createHmac("sha256", API_SECRET)
    .update(bodyString + timestamp)
    .digest("hex");

  return {
    "Content-Type": "application/json",
    "x-api-key": API_KEY,
    "x-timestamp": timestamp,
    "x-signature": signature,
  };
}

async function request<T>(
  path: string,
  init?: RequestInit & { _body?: object },
): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const body = init?._body;

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...signedHeaders(method, body),
      ...(init?.headers ?? {}),
    },
    body: body ? JSON.stringify(body) : init?.body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Platform API ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlatformSalon {
  _id?: string;
  id?: string;
  name: string;
  city?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  description?: string;
  logo?: string;
  slug?: string;
  tenantId?: string;
  distance?: number | null;
  nextAvailableSlot?: string | null;
  nextSlots?: { startTime: string; serviceId: string | null }[];
  services?: PlatformService[];
  [key: string]: unknown;
}

export interface PlatformService {
  _id?: string;
  id?: string;
  name: string;
  duration?: number;
  basePrice?: number;
  price?: number;
  category?: string;
  [key: string]: unknown;
}

export interface PlatformSlot {
  _id: string;
  salonId: string;
  serviceId?: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

// ─── Search types ─────────────────────────────────────────────────────────────

export interface PlatformSearchSlot {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
}

export interface PlatformSearchService {
  id: string;
  name: string;
  category: string;
  slug: string;
  duration: number;
  price: number | null;
}

export interface PlatformSearchSalon {
  id: string;
  name: string;
  city: string;
  lat: number | null;
  lng: number | null;
  logo: string | null;
  slug: string | null;
  phone: string | null;
}

export interface PlatformSearchResult {
  slot: PlatformSearchSlot;
  service: PlatformSearchService | null;
  salon: PlatformSearchSalon;
  distanceKm: number | null;
  fallbackLevel: number;
}

export interface PlatformSearchResponse {
  results: PlatformSearchResult[];
  total: number;
  fallbackLevel: number;
  fallbackLabel: string;
  debug: Record<string, unknown>;
}

export interface CreateBookingPayload {
  salonId: string;
  serviceId: string;
  startTime: string;
  clientId?: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  clientInstagram?: string;
  preferredContact?: "phone" | "instagram" | "email" | "platform";
  contactNote?: string;
  user: { name: string; phone?: string; email?: string; instagram?: string };
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

// ─── Working hours ────────────────────────────────────────────────────────────

export type PlatformWorkingHours = Record<string, Array<{ from: string; to: string }>>;

/** Converts platform working hours format to "HH:MM-HH:MM" strings per day. */
export function convertWorkingHours(raw: PlatformWorkingHours): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [day, ranges] of Object.entries(raw)) {
    if (Array.isArray(ranges) && ranges.length > 0) {
      const { from, to } = ranges[0];
      if (from && to) result[day] = `${from}-${to}`;
    }
  }
  return result;
}

// ─── Client ──────────────────────────────────────────────────────────────────

export const platformClient = {
  getCategories() {
    return request<PlatformCategory[]>("/marketplace/categories", {
      next: { revalidate: 3600 },
    } as RequestInit);
  },

  getSalonProfiles(params?: { city?: string; lat?: number; lng?: number }) {
    const qs = new URLSearchParams();
    if (params?.city) qs.set("city", params.city);
    if (params?.lat != null) qs.set("lat", String(params.lat));
    if (params?.lng != null) qs.set("lng", String(params.lng));
    const q = qs.toString();
    return request<PlatformSalon[]>(`/marketplace/salons${q ? `?${q}` : ""}`, {
      next: { revalidate: 60 },
    } as RequestInit);
  },

  getSalonServices(salonId: string) {
    return request<PlatformService[]>(
      `/marketplace/services?salonId=${salonId}`,
      {
        next: { revalidate: 60 },
      } as RequestInit,
    );
  },

  getSalonWorkingHours(salonId: string) {
    return request<PlatformWorkingHours>(
      `/marketplace/working-hours?salonId=${salonId}`,
      {
        next: { revalidate: 3600 },
      } as RequestInit,
    );
  },

  getAvailableSlots(params: {
    salonId: string;
    serviceId?: string;
    date?: string;
  }) {
    const qs = new URLSearchParams({ salonId: params.salonId });
    if (params.serviceId) qs.set("serviceId", params.serviceId);
    if (params.date) qs.set("date", params.date);
    return request<PlatformSlot[]>(`/marketplace/slots?${qs.toString()}`, {
      cache: "no-store",
    } as RequestInit);
  },

  searchSlots(params: {
    category?: string;
    city?: string;
    date?: string;
    time?: string;
    lat?: number;
    lng?: number;
    limit?: number;
  }) {
    const qs = new URLSearchParams();
    if (params.category) qs.set("category", params.category);
    if (params.city) qs.set("city", params.city);
    if (params.date) qs.set("date", params.date);
    if (params.time) qs.set("time", params.time);
    if (params.lat != null) qs.set("lat", String(params.lat));
    if (params.lng != null) qs.set("lng", String(params.lng));
    if (params.limit) qs.set("limit", String(params.limit));
    return request<PlatformSearchResponse>(
      `/marketplace/search?${qs.toString()}`,
      { next: { revalidate: 0 } } as RequestInit,
    );
  },

  createBooking(payload: CreateBookingPayload) {
    return request<{ _id: string }>("/booking", {
      method: "POST",
      _body: payload,
    });
  },

  login(payload: LoginPayload) {
    return request<{ token: string; refreshToken?: string }>("/auth/login", {
      method: "POST",
      _body: payload,
    });
  },

  register(payload: RegisterPayload) {
    return request<{ token: string; refreshToken?: string }>("/auth/register", {
      method: "POST",
      _body: payload,
    });
  },
};

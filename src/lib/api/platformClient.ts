// src/lib/api/platformClient.ts
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

async function request<T>(path: string, init?: RequestInit & { _body?: object }): Promise<T> {
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
  _id: string;
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
  services?: PlatformService[];
  [key: string]: unknown;
}

export interface PlatformService {
  _id: string;
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

export interface CreateBookingPayload {
  salonId: string;
  serviceId: string;
  startTime: string;
  user: { name: string; phone: string; email?: string };
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

// ─── Client ──────────────────────────────────────────────────────────────────

export const platformClient = {
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
    return request<PlatformService[]>(`/marketplace/services?salonId=${salonId}`, {
      next: { revalidate: 60 },
    } as RequestInit);
  },

  getSalonWorkingHours(salonId: string) {
    return request<Record<string, string>>(`/marketplace/working-hours?salonId=${salonId}`, {
      next: { revalidate: 3600 },
    } as RequestInit);
  },

  getAvailableSlots(params: { salonId: string; serviceId?: string; date?: string }) {
    const qs = new URLSearchParams({ salonId: params.salonId });
    if (params.serviceId) qs.set("serviceId", params.serviceId);
    if (params.date) qs.set("date", params.date);
    return request<PlatformSlot[]>(`/marketplace/slots?${qs.toString()}`, {
      next: { revalidate: 30 },
    } as RequestInit);
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

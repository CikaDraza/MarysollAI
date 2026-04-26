// src/lib/api/platformClient.ts

const BASE = (process.env.PLATFORM_API_URL ?? "").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Platform API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export interface PlatformSalon {
  _id: string;
  name: string;
  city?: string;
  lat?: number;
  lng?: number;
  workingHours?: Record<string, string>;
  [key: string]: unknown;
}

export interface PlatformService {
  _id: string;
  name: string;
  duration?: number;
  basePrice?: number;
  price?: number;
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

export const platformClient = {
  getSalonProfiles(params?: { city?: string; lat?: number; lng?: number }) {
    const qs = new URLSearchParams();
    if (params?.city) qs.set("city", params.city);
    if (params?.lat != null) qs.set("lat", String(params.lat));
    if (params?.lng != null) qs.set("lng", String(params.lng));
    const q = qs.toString();
    return request<PlatformSalon[]>(`/salons${q ? `?${q}` : ""}`, {
      next: { revalidate: 300 },
    } as RequestInit);
  },

  getSalonServices(salonId: string) {
    return request<PlatformService[]>(`/salons/${salonId}/services`, {
      next: { revalidate: 60 },
    } as RequestInit);
  },

  getSalonWorkingHours(salonId: string) {
    return request<Record<string, string>>(`/salons/${salonId}/working-hours`, {
      next: { revalidate: 3600 },
    } as RequestInit);
  },

  getAvailableSlots(params: { salonId: string; serviceId?: string; date?: string }) {
    const qs = new URLSearchParams({ salonId: params.salonId });
    if (params.serviceId) qs.set("serviceId", params.serviceId);
    if (params.date) qs.set("date", params.date);
    return request<PlatformSlot[]>(`/slots?${qs.toString()}`, {
      next: { revalidate: 30 },
    } as RequestInit);
  },

  createBooking(payload: CreateBookingPayload) {
    return request<{ _id: string }>("/bookings", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  login(payload: LoginPayload) {
    return request<{ token: string; refreshToken?: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  register(payload: RegisterPayload) {
    return request<{ token: string; refreshToken?: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};

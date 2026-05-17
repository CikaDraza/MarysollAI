// src/lib/mappers/salonMapper.ts
import type { PlatformSalon, PlatformService, PlatformSlot } from "@/lib/api/platformClient";

export interface MappedSalon {
  id: string;
  tenantId?: string;
  name: string;
  city?: string;
  location: { lat?: number; lng?: number; city?: string };
  services: MappedService[];
  nextAvailableSlot: string | null;
  nextSlots: { startTime: string; serviceId: string | null }[];
  workingHours: Record<string, string>;
  distanceKm?: number;
}

export interface MappedService {
  id: string;
  rawId: string; // MongoDB _id — used for slot.serviceId matching (may differ from id)
  name: string;
  category: string;
  duration: number;
  price: number;
  hasVariants: boolean;
}

export interface MappedSlot {
  id: string;
  salonId: string;
  serviceId: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

export function mapSalon(raw: PlatformSalon): MappedSalon {
  return {
    id: raw.id ?? raw._id ?? "",
    tenantId: raw.tenantId,
    name: raw.name,
    city: raw.city,
    location: { lat: raw.lat, lng: raw.lng, city: raw.city },
    services: (raw.services ?? []).map(mapService),
    nextAvailableSlot: (raw.nextAvailableSlot as string | null | undefined) ?? null,
    nextSlots: (raw.nextSlots as { startTime: string; serviceId: string | null }[] | undefined) ?? [],
    workingHours: (raw.workingHours as Record<string, string>) ?? {},
  };
}

interface RawVariant {
  name?: string;
  price?: number;
  duration?: number;
}

function parseVariants(raw: unknown): RawVariant[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is RawVariant => v != null && typeof v === "object");
}

export function mapService(raw: PlatformService): MappedService {
  const r = raw as Record<string, unknown>;
  const isVariantType = r.type === "variant";
  const isGroupType = r.type === "group";
  const variants = parseVariants(r.variants);
  const groupServices = parseVariants(r.services as unknown);

  let price = 0;
  let hasVariants = false;
  let duration = (raw.duration as number | undefined) ?? 60;

  if (isVariantType && variants.length > 0) {
    const prices = variants.map((v) => v.price ?? 0).filter((p) => p > 0);
    price = prices.length > 0 ? Math.min(...prices) : 0;
    hasVariants = true;
    const durations = variants.map((v) => v.duration ?? 60).filter((d) => d > 0);
    if (durations.length > 0) duration = Math.min(...durations);
  } else if (isGroupType && groupServices.length > 0) {
    const prices = groupServices.map((v) => v.price ?? 0).filter((p) => p > 0);
    price = prices.length > 0 ? Math.min(...prices) : 0;
    hasVariants = true;
  } else {
    price = (raw.basePrice ?? raw.price ?? 0) as number;
    hasVariants = false;
  }

  return {
    id: (raw.id ?? raw._id ?? "") as string,
    rawId: (raw._id ?? raw.id ?? "") as string,
    name: raw.name,
    category: (r.categorySlug ?? raw.category ?? "") as string,
    duration,
    price,
    hasVariants,
  };
}

export function mapSlot(raw: PlatformSlot): MappedSlot {
  return {
    id: raw._id,
    salonId: raw.salonId,
    serviceId: raw.serviceId ?? "",
    startTime: raw.startTime,
    endTime: raw.endTime,
    isAvailable: raw.isAvailable,
  };
}

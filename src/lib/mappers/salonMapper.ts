// src/lib/mappers/salonMapper.ts
import type { PlatformSalon, PlatformService, PlatformSlot } from "@/lib/api/platformClient";

export interface MappedSalon {
  id: string;
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
  name: string;
  category: string;
  duration: number;
  price: number;
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
    name: raw.name,
    city: raw.city,
    location: { lat: raw.lat, lng: raw.lng, city: raw.city },
    services: (raw.services ?? []).map(mapService),
    nextAvailableSlot: (raw.nextAvailableSlot as string | null | undefined) ?? null,
    nextSlots: (raw.nextSlots as { startTime: string; serviceId: string | null }[] | undefined) ?? [],
    workingHours: (raw.workingHours as Record<string, string>) ?? {},
  };
}

export function mapService(raw: PlatformService): MappedService {
  return {
    id: raw.id ?? raw._id ?? "",
    name: raw.name,
    category: raw.category ?? "",
    duration: raw.duration ?? 60,
    price: raw.basePrice ?? raw.price ?? 0,
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

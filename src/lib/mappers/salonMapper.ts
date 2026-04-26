// src/lib/mappers/salonMapper.ts
import type { PlatformSalon, PlatformService, PlatformSlot } from "@/lib/api/platformClient";

export interface MappedSalon {
  id: string;
  name: string;
  location: { lat?: number; lng?: number; city?: string };
  services: MappedService[];
  workingHours: Record<string, string>;
  distanceKm?: number;
}

export interface MappedService {
  id: string;
  name: string;
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
    id: raw._id,
    name: raw.name,
    location: {
      lat: raw.lat,
      lng: raw.lng,
      city: raw.city,
    },
    services: [],
    workingHours: (raw.workingHours as Record<string, string>) ?? {},
  };
}

export function mapService(raw: PlatformService): MappedService {
  return {
    id: raw._id,
    name: raw.name,
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

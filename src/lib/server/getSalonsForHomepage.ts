// src/lib/server/getSalonsForHomepage.ts
import { platformClient } from "@/lib/api/platformClient";
import { mapSalon, mapService, mapSlot, MappedSalon, MappedService, MappedSlot } from "@/lib/mappers/salonMapper";
import { getDistanceKm } from "@/lib/utils/distance";
import { getCity } from "@/lib/geo/getCity";

export interface SalonWithData {
  salon: MappedSalon;
  services: MappedService[];
  slots: MappedSlot[];
}

export async function getSalonsForHomepage(
  headers?: Record<string, string>,
): Promise<SalonWithData[]> {
  const cityResult = await getCity(headers);
  const today = new Date().toISOString().split("T")[0];

  const rawSalons = await platformClient.getSalonProfiles({
    city: cityResult.city,
    lat: cityResult.lat,
    lng: cityResult.lng,
  });

  // Limit to 2 salons
  const top2 = rawSalons.slice(0, 2);

  // Fetch services + slots in parallel for both salons
  const results = await Promise.all(
    top2.map(async (raw) => {
      const salon = mapSalon(raw);

      const [rawServices, rawSlots] = await Promise.all([
        platformClient.getSalonServices(salon.id).catch(() => []),
        platformClient.getAvailableSlots({ salonId: salon.id, date: today }).catch(() => []),
      ]);

      const services = rawServices.map(mapService);
      const slots = rawSlots
        .map(mapSlot)
        .filter((s) => s.isAvailable)
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .slice(0, 3);

      // Attach distance if we have coordinates
      if (cityResult.lat != null && cityResult.lng != null && raw.lat != null && raw.lng != null) {
        salon.distanceKm = getDistanceKm(cityResult.lat, cityResult.lng, raw.lat, raw.lng);
      }

      salon.services = services;

      return { salon, services, slots };
    }),
  );

  // Sort by distance if available, else keep API order
  if (cityResult.lat != null) {
    results.sort((a, b) => (a.salon.distanceKm ?? Infinity) - (b.salon.distanceKm ?? Infinity));
  }

  return results;
}

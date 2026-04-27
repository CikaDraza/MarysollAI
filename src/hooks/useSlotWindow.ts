// Fetches all salons (no city filter), flattens slots, groups by the 2 cities
// nearest to the user's selected city that actually have available slots.
import { useMemo } from "react";
import { useSalons } from "./useSalons";
import { normalizeCategory } from "@/lib/slots/normalize";
import { CANONICAL_TO_SLUG } from "@/lib/intent/categoryMap";
import { findCity, haversineKm } from "@/lib/cities";
import type { FlatSlot } from "@/types/slots";

export interface CitySlots {
  city: string;
  slots: FlatSlot[];
}

interface Params {
  selectedCity?: string; // display name, e.g. "Novi Sad"
  category?: string;     // categorySlug, e.g. "massage"
}

export function useSlotWindow({ selectedCity, category }: Params = {}) {
  const { data: salons = [], isLoading } = useSalons(undefined);

  const { slots, slotsByCity } = useMemo<{ slots: FlatSlot[]; slotsByCity: CitySlots[] }>(() => {
    const flat: FlatSlot[] = [];

    for (const salon of salons) {
      for (const s of salon.nextSlots) {
        const svc = salon.services.find((sv) => sv.id === s.serviceId);
        const serviceName = svc?.name ?? "Slobodan termin";

        // Convert DB canonical label → slug; fall back to name-based detection
        const rawCat = svc?.category ?? "";
        const cat: string = rawCat
          ? (CANONICAL_TO_SLUG[rawCat] ?? normalizeCategory(serviceName))
          : normalizeCategory(serviceName);

        if (category && cat !== category) continue;

        flat.push({
          salonId: salon.id,
          salonName: salon.name,
          serviceId: s.serviceId,
          serviceName,
          category: cat,
          startTime: s.startTime,
          city: salon.city ?? "",
          distanceKm: salon.distanceKm,
          price: svc?.price ?? undefined,
        });
      }
    }

    flat.sort((a, b) => a.startTime.localeCompare(b.startTime));

    const cityMap = new Map<string, FlatSlot[]>();
    for (const slot of flat) {
      if (!slot.city) continue;
      const existing = cityMap.get(slot.city) ?? [];
      existing.push(slot);
      cityMap.set(slot.city, existing);
    }

    const refCity = selectedCity ? findCity(selectedCity) : undefined;
    const sortedCityNames = [...cityMap.keys()].sort((a, b) => {
      if (!refCity) return 0;
      const ca = findCity(a);
      const cb = findCity(b);
      const da = ca ? haversineKm(refCity.lat, refCity.lng, ca.lat, ca.lng) : Infinity;
      const db = cb ? haversineKm(refCity.lat, refCity.lng, cb.lat, cb.lng) : Infinity;
      return da - db;
    });

    const slotsByCity: CitySlots[] = sortedCityNames.slice(0, 2).map((cityName) => ({
      city: cityName,
      slots: (cityMap.get(cityName) ?? []).slice(0, 6),
    }));

    return { slots: flat, slotsByCity };
  }, [salons, selectedCity, category]);

  const bestSlot: FlatSlot | null = slots[0] ?? null;

  return { slots, slotsByCity, bestSlot, isLoading };
}

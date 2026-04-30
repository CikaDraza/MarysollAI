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
  date?: string;         // "YYYY-MM-DD" — filter slots to this date
  time?: string;         // "HH:MM" — show slots at or after this time
  subcategory?: string;  // free-text filter against serviceName (or salon services for generic slots)
}

function stripDiacritics(s: string) {
  return s.toLowerCase()
    .replace(/š/g, "s").replace(/đ/g, "dj").replace(/ž/g, "z")
    .replace(/č/g, "c").replace(/ć/g, "c");
}

export function useSlotWindow({ selectedCity, category, date, time, subcategory }: Params = {}) {
  const { data: salons = [], isLoading } = useSalons(undefined);

  const { slots, slotsByCity } = useMemo<{ slots: FlatSlot[]; slotsByCity: CitySlots[] }>(() => {
    const flat: FlatSlot[] = [];
    const reqHour = time ? parseInt(time.split(":")[0], 10) : undefined;
    const subNorm = subcategory ? stripDiacritics(subcategory) : undefined;

    for (const salon of salons) {
      for (const s of salon.nextSlots) {
        const svc = salon.services.find((sv) => sv.id === s.serviceId);
        const serviceName = svc?.name ?? "Slobodan termin";

        // Convert DB canonical label → slug; fall back to name-based detection
        const rawCat = svc?.category ?? "";
        const cat: string = rawCat
          ? (CANONICAL_TO_SLUG[rawCat] ?? normalizeCategory(serviceName))
          : normalizeCategory(serviceName);

        if (category && s.serviceId != null && cat !== category) continue;

        // Date filter — restrict to requested date
        if (date) {
          const slotDate = new Date(s.startTime).toISOString().slice(0, 10);
          if (slotDate !== date) continue;
        }

        // Subcategory filter:
        // - Named service slot: match serviceName directly
        // - Generic free slot (serviceId null): match against any of the salon's services
        if (subNorm) {
          if (s.serviceId != null) {
            if (!stripDiacritics(serviceName).includes(subNorm)) continue;
          } else {
            const salonOffersService = salon.services.some((sv) =>
              stripDiacritics(sv.name).includes(subNorm)
            );
            if (!salonOffersService) continue;
          }
        }

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

    // Soft time filter: prefer slots at/after requested hour; fall back to all if none match
    const timeFiltered = reqHour !== undefined
      ? flat.filter((s) => new Date(s.startTime).getHours() >= reqHour)
      : flat;
    const result = timeFiltered.length > 0 ? timeFiltered : flat;
    result.sort((a, b) => a.startTime.localeCompare(b.startTime));

    const cityMap = new Map<string, FlatSlot[]>();
    for (const slot of result) {
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

    return { slots: result, slotsByCity };
  }, [salons, selectedCity, category, date, time, subcategory]);

  const bestSlot: FlatSlot | null = slots[0] ?? null;

  return { slots, slotsByCity, bestSlot, isLoading };
}

import type { NormalizedSearchIntent } from "@/lib/search/normalizeSearchIntent";
import {
  distanceToCityKm,
  selectEffectiveCity,
} from "@/lib/search/selectEffectiveCity";
import type { SearchResult } from "@/types/slots";
import type {
  NearbyCitySuggestion,
  RecoveryScenario,
  SearchRecoveryResult,
} from "@/types/searchRecovery";

function sameCity(slot: SearchResult, city?: string): boolean {
  if (!city) return false;
  return slot.city.toLowerCase().trim() === city.toLowerCase().trim();
}

function sortByStart(slots: SearchResult[]): SearchResult[] {
  return [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function queryLabel(intent: NormalizedSearchIntent): string {
  return intent.originalQuery || intent.canonicalCategory || "ovu uslugu";
}

function cityCases(city?: string): { inCity: string; bareCity: string } {
  if (!city) return { inCity: "izabranom gradu", bareCity: "izabrani grad" };
  if (city === "Sremska Mitrovica") {
    return { inCity: "Sremskoj Mitrovici", bareCity: city };
  }
  if (city === "Novi Sad") return { inCity: "Novom Sadu", bareCity: city };
  if (city === "Beograd") return { inCity: "Beogradu", bareCity: city };
  if (city === "Bor") return { inCity: "Boru", bareCity: city };
  return { inCity: city, bareCity: city };
}

function inCity(city?: string): string {
  return cityCases(city).inCity;
}

function citySuggestions(input: {
  exactOtherCitySlots: SearchResult[];
  relatedOtherCitySlots: SearchResult[];
  requestedCity?: string;
  userLocation?: { lat: number; lng: number };
}): NearbyCitySuggestion[] {
  const byCity = new Map<string, NearbyCitySuggestion>();
  const add = (
    slot: SearchResult,
    reason: NearbyCitySuggestion["reason"],
  ) => {
    if (!slot.city) return;
    const prev = byCity.get(slot.city);
    byCity.set(slot.city, {
      city: slot.city,
      count: (prev?.count ?? 0) + 1,
      distanceKm:
        prev?.distanceKm ??
        distanceToCityKm(slot.city, input.userLocation, input.requestedCity),
      reason: prev?.reason === "exact_service" ? prev.reason : reason,
    });
  };

  input.exactOtherCitySlots.forEach((slot) => add(slot, "exact_service"));
  input.relatedOtherCitySlots.forEach((slot) => add(slot, "related_service"));

  return [...byCity.values()]
    .sort((a, b) => {
      const da = a.distanceKm ?? Number.POSITIVE_INFINITY;
      const db = b.distanceKm ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return b.count - a.count;
    })
    .slice(0, 6);
}

export function resolveSearchRecoveryScenario(input: {
  requestedCity?: string;
  normalizedIntent: NormalizedSearchIntent;
  exactRequestedCitySlots: SearchResult[];
  relatedRequestedCitySlots: SearchResult[];
  exactOtherCitySlots: SearchResult[];
  relatedOtherCitySlots: SearchResult[];
  userLocation?: { lat: number; lng: number };
}): SearchRecoveryResult {
  const suggestions = citySuggestions(input);
  const requestedCity = input.requestedCity;
  const requested = cityCases(requestedCity);
  const label = queryLabel(input.normalizedIntent);

  const exactCity = selectEffectiveCity({
    slots: input.exactOtherCitySlots,
    requestedCity,
    userLocation: input.userLocation,
    reason: "nearest_with_exact_service",
  });
  const relatedCity = selectEffectiveCity({
    slots: input.relatedOtherCitySlots,
    requestedCity,
    userLocation: input.userLocation,
    reason: "nearest_with_related_service",
  });

  let recoveryScenario: RecoveryScenario = "empty";
  let effectiveCity = requestedCity;
  let selectedSlots: SearchResult[] = [];
  let effectiveCityReason: string | undefined;
  let userMessage: string | undefined;

  if (input.normalizedIntent.queryType === "empty" || input.normalizedIntent.queryType === "city_only") {
    recoveryScenario = "discovery";
    selectedSlots = sortByStart([
      ...input.exactRequestedCitySlots,
      ...input.relatedRequestedCitySlots,
      ...input.exactOtherCitySlots,
      ...input.relatedOtherCitySlots,
    ]);
    effectiveCity = requestedCity;
  } else if (input.exactRequestedCitySlots.length > 0) {
    recoveryScenario = "exact_in_requested_city";
    selectedSlots = sortByStart(input.exactRequestedCitySlots);
    effectiveCity = requestedCity;
  } else if (exactCity) {
    recoveryScenario = "exact_in_nearest_city";
    effectiveCity = exactCity.city;
    effectiveCityReason = exactCity.reason;
    selectedSlots = sortByStart(
      input.exactOtherCitySlots.filter((slot) => sameCity(slot, effectiveCity)),
    );
    userMessage = `Nema ${label} u ${requested.inCity}. Prikazujemo najbliže termine u ${inCity(effectiveCity)}.`;
  } else if (input.relatedRequestedCitySlots.length > 0) {
    recoveryScenario = "related_in_requested_city";
    selectedSlots = sortByStart(input.relatedRequestedCitySlots);
    effectiveCity = requestedCity;
    userMessage = `Nemamo ${label} u ${requested.inCity}. Pronašli smo slične tretmane.`;
  } else if (relatedCity) {
    recoveryScenario = "related_in_nearest_city";
    effectiveCity = relatedCity.city;
    effectiveCityReason = relatedCity.reason;
    selectedSlots = sortByStart(
      input.relatedOtherCitySlots.filter((slot) => sameCity(slot, effectiveCity)),
    );
    userMessage = `Nema ${label} u ${requested.inCity}. Prikazujemo najbliže slične usluge u ${inCity(effectiveCity)}.`;
  }

  const exactMatchInRequestedCity = input.exactRequestedCitySlots.length > 0;
  const exactMatchInNearestCity = Boolean(exactCity);
  const relatedMatchInRequestedCity = input.relatedRequestedCitySlots.length > 0;
  const relatedMatchInNearestCity = Boolean(relatedCity);

  return {
    selectedSlots,
    recoveryState: {
      requestedCity,
      effectiveCity,
      recoveryScenario,
      exactMatchFound: exactMatchInRequestedCity || exactMatchInNearestCity,
      exactMatchInRequestedCity,
      exactMatchInNearestCity,
      relatedMatchFound: relatedMatchInRequestedCity || relatedMatchInNearestCity,
      relatedMatchInRequestedCity,
      relatedMatchInNearestCity,
      selectedCityHasResults: selectedSlots.some((slot) => sameCity(slot, requestedCity)),
      effectiveCityReason,
      nearbyCitySuggestions: suggestions,
      userMessage,
    },
  };
}

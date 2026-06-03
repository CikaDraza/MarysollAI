import type { SearchRecoveryState } from "@/types/searchRecovery";
import { cityLocative } from "@/lib/geo/cityLocative";

function inCity(city?: string): string {
  return cityLocative(city);
}

export function bookingWidgetRecoveryCopy(input: {
  city?: string;
  recoveryState?: Partial<SearchRecoveryState>;
  hasSearchIntent?: boolean;
  categoryLabel?: string;
  serviceLabel?: string;
}): { title: string; body?: string } | null {
  const city = input.recoveryState?.requestedCity ?? input.city;
  switch (input.recoveryState?.reason) {
    case "no_city_salons":
      return {
        title: `Nema salona u ${inCity(city)}. Prikazujemo najbliže slobodne termine.`,
      };
    case "no_city_slots": {
      // Salon EXISTS in the city — never say "Nema salona". Distinguish whether
      // a specific service was requested.
      const service = input.serviceLabel ?? input.categoryLabel;
      if (service) {
        return {
          title: `U ${inCity(city)} postoji usluga ${service}, ali trenutno nema slobodnih termina.`,
          body: "Prikazujemo najbliže dostupne termine.",
        };
      }
      return {
        title: `U ${inCity(city)} imamo salon, ali trenutno nema slobodnih termina za ovu uslugu.`,
        body: "Prikazujemo najbliže dostupne termine.",
      };
    }
    case "expanded_to_nearby_cities":
      return {
        title: "Najbliži slobodni termini",
        body: city
          ? `Prikazujemo dostupne termine u gradovima blizu ${inCity(city)}.`
          : undefined,
      };
    case "synthetic_recovery":
      return {
        title: "Predlozi termina na osnovu radnog vremena",
      };
    case "no_service_match":
      if (input.categoryLabel || input.serviceLabel) {
        return {
          title: `Nema slobodnih termina za ${input.serviceLabel ?? input.categoryLabel}${city ? ` u ${inCity(city)}` : ""}.`,
          body: "Prikazujemo najbliže dostupne opcije.",
        };
      }
      return {
        title: "Nismo prepoznali tačno ovu uslugu.",
        body: "Pogledajte dostupne kategorije.",
      };
    case "no_platform_slots":
      return {
        title: "Trenutno nema dostupnih termina.",
      };
  }

  if (input.hasSearchIntent && input.categoryLabel) {
    return {
      title: `Nema slobodnih termina za ${input.categoryLabel}${city ? ` u ${inCity(city)}` : ""}.`,
      body: "Prikazujemo najbliže dostupne opcije.",
    };
  }

  return null;
}

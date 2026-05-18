import type { SearchRecoveryState } from "@/types/searchRecovery";

function inCity(city?: string): string {
  if (!city) return "izabranom gradu";
  if (city === "Sremska Mitrovica") return "Sremskoj Mitrovici";
  if (city === "Novi Sad") return "Novom Sadu";
  if (city === "Beograd") return "Beogradu";
  if (city === "Bor") return "Boru";
  return city;
}

export function bookingWidgetRecoveryCopy(input: {
  city?: string;
  recoveryState?: Partial<SearchRecoveryState>;
  hasSearchIntent?: boolean;
  categoryLabel?: string;
}): { title: string; body?: string } | null {
  const city = input.recoveryState?.requestedCity ?? input.city;
  switch (input.recoveryState?.reason) {
    case "no_city_salons":
      return {
        title: `Nema salona u ${inCity(city)}. Prikazujemo najbliže slobodne termine.`,
      };
    case "no_city_slots":
      return {
        title: `Nema slobodnih termina u ${inCity(city)}. Prikazujemo najbliže dostupne termine.`,
      };
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

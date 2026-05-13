import { SERBIAN_CITIES } from "@/lib/cities";
import { stripDiacritics } from "@/lib/intent/parseIntent";

export interface CityAvailabilityQuestion {
  detected: boolean;
  city?: string;
}

export function detectCityAvailabilityQuestion(
  text: string,
): CityAvailabilityQuestion {
  const normalized = stripDiacritics(text).toLowerCase();
  const city = SERBIAN_CITIES.find((item) => {
    const cityNorm = stripDiacritics(item.name).toLowerCase();
    const aliases: Record<string, string[]> = {
      "novi sad": ["novom sadu", "novi sad"],
      "beograd": ["beogradu", "beograd"],
      "sremska mitrovica": ["sremskoj mitrovici", "sremska mitrovica", "sremskoj"],
      "bor": ["boru", "bor"],
    };
    const shortNorm = cityNorm.split(" ")[0];
    return (
      normalized.includes(cityNorm) ||
      normalized.includes(shortNorm) ||
      (aliases[cityNorm] ?? []).some((alias) => normalized.includes(alias))
    );
  })?.name;

  const hasAvailabilityPhrase =
    /\b(da li ima|ima li|a u|moze|može|radite|imate)\b/.test(normalized) ||
    (Boolean(city) && normalized.length <= 40);

  return {
    detected: Boolean(city && hasAvailabilityPhrase),
    city,
  };
}

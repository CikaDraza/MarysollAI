// Serbian locative case for city names, used after the preposition "u"
// (e.g. "u Boru", "u Novom Sadu", "u Nišu"). Auto-generated SEO copy that says
// "u Bor" reads as broken Serbian and looks machine-made, so we decline the
// known cities explicitly. Unknown (dynamically added) cities fall back to the
// nominative form.

import { canonicalCity } from "@/lib/geo/canonicalCity";

const CITY_LOCATIVE: Record<string, string> = {
  Beograd: "Beogradu",
  "Novi Sad": "Novom Sadu",
  Niš: "Nišu",
  Kragujevac: "Kragujevcu",
  Subotica: "Subotici",
  Zrenjanin: "Zrenjaninu",
  Pančevo: "Pančevu",
  Čačak: "Čačku",
  Kraljevo: "Kraljevu",
  Kruševac: "Kruševcu",
  Smederevo: "Smederevu",
  Leskovac: "Leskovcu",
  Valjevo: "Valjevu",
  Užice: "Užicu",
  Šabac: "Šapcu",
  Sombor: "Somboru",
  Požarevac: "Požarevcu",
  Pirot: "Pirotu",
  Zaječar: "Zaječaru",
  Vranje: "Vranju",
  "Sremska Mitrovica": "Sremskoj Mitrovici",
  Loznica: "Loznici",
  "Novi Pazar": "Novom Pazaru",
  Bor: "Boru",
  Vršac: "Vršcu",
  Kikinda: "Kikindi",
  Jagodina: "Jagodini",
  Prokuplje: "Prokuplju",
  Vrbas: "Vrbasu",
  // Nationwide pseudo-city for the /svi-gradovi pages.
  Srbija: "Srbiji",
};

/** Returns the locative form of a city ("Bor" → "Boru"), or the input when unknown. */
export function cityLocative(name: string): string {
  return CITY_LOCATIVE[canonicalCity(name)] ?? name;
}

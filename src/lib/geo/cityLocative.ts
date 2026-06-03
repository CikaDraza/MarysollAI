// Serbian locative case for city names ("u Kruševcu", "u Nišu").
// Covers the marketplace cities; unknown names fall back to the nominative,
// which still reads acceptably ("u Pirot").
const LOCATIVE: Record<string, string> = {
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
  Ruma: "Rumi",
};

/** Returns the city name in Serbian locative case (for "u {grad}"). */
export function cityLocative(city: string | undefined | null): string {
  if (!city) return "izabranom gradu";
  return LOCATIVE[city.trim()] ?? city.trim();
}

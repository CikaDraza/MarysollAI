// Display-facing keywords per category, used for SEO copy (H1, subtitle, and
// later FAQ + internal links). These are HUMAN-READABLE Serbian terms WITH
// diacritics — distinct from the diacritic-stripped matching synonyms in
// `src/lib/intent/categoryMap.ts` (CATEGORY_MAP) used by the search parser.
//
// Keep the two conceptually in sync: if you add a service kind here, make sure
// the parser can still match it via CATEGORY_MAP.

import type { CategorySlug } from "@/lib/intent/categoryMap";

export interface CategoryKeywords {
  /** Noun used to lead the H1, e.g. "Frizura u Boru …". */
  h1Noun: string;
  /** Human keywords for the subtitle / FAQ, most representative first. */
  keywords: string[];
}

export const CATEGORY_KEYWORDS: Record<CategorySlug, CategoryKeywords> = {
  hair: {
    h1Noun: "Frizura",
    keywords: ["šišanje", "feniranje", "farbanje", "frizerske usluge"],
  },
  nails: {
    h1Noun: "Manikir i nokti",
    keywords: ["manikir", "gel lak", "nadogradnja noktiju", "pedikir"],
  },
  makeup: {
    h1Noun: "Šminkanje",
    keywords: ["šminkanje", "svadbena šminka", "šminka za proslave", "make-up"],
  },
  massage: {
    h1Noun: "Masaža",
    keywords: ["relax masaža", "sportska masaža", "anticelulit masaža", "maderoterapija"],
  },
  waxing: {
    h1Noun: "Depilacija",
    keywords: ["depilacija voskom", "sugaring", "lasersko uklanjanje dlačica", "epilacija"],
  },
  eyebrows: {
    h1Noun: "Obrve i trepavice",
    keywords: ["oblikovanje obrva", "laminacija obrva", "henna obrve", "trepavice"],
  },
  facial: {
    h1Noun: "Tretman lica",
    keywords: ["čišćenje lica", "piling", "hijaluron", "nega lica"],
  },
  body: {
    h1Noun: "Oblikovanje tela",
    keywords: ["oblikovanje tela", "kavitacija", "radiotalasi", "anticelulit tretmani"],
  },
  other: {
    h1Noun: "Usluge lepote",
    keywords: ["tretmani lepote", "saloni lepote", "velnes"],
  },
};

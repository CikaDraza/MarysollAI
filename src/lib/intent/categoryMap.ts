export type CategorySlug =
  | "massage"
  | "nails"
  | "hair"
  | "makeup"
  | "waxing"
  | "eyebrows"
  | "facial"
  | "body"
  | "other";

/**
 * Maps slug → primary display label (matches platform Category.label).
 * These values MUST match what the platform DB stores in Category.label
 * so that CANONICAL_TO_SLUG inverse lookup works correctly.
 */
export const SLUG_TO_CANONICAL: Record<CategorySlug, string> = {
  massage:  "Masaža",
  nails:    "Nokti",
  hair:     "Kosa",       // platform label is "Kosa", not "Frizure"
  makeup:   "Šminka",
  waxing:   "Depilacija",
  eyebrows: "Obrve",
  facial:   "Tretman lica",
  body:     "Oblikovanje Tela",
  other:    "Ostalo",
};

/**
 * Inverse map — any platform label OR display alias → slug.
 * Includes both platform-canonical labels AND common UI aliases
 * so that old/alternate names still resolve correctly.
 */
export const CANONICAL_TO_SLUG: Record<string, CategorySlug> = {
  // Platform-canonical labels (from Category.label)
  "Masaža":          "massage",
  "Nokti":           "nails",
  "Kosa":            "hair",
  "Šminka":          "makeup",
  "Depilacija":      "waxing",
  "Obrve":           "eyebrows",
  "Tretman lica":    "facial",
  "Oblikovanje Tela": "body",
  "Ostalo":          "other",
  // UI aliases (legacy / alternate spellings)
  "Frizure":         "hair",
  "Masaza":          "massage",
  "Obrve i trepavice": "eyebrows",
  "Trepavice":       "eyebrows",
  "Lice":            "facial",
};

/**
 * Each entry: [slug, synonyms[]]
 * Synonyms are stripped of diacritics (matched against normalized search input).
 * Sources: platform Category.synonyms + subcategory.synonyms merged here.
 * Order matters — more specific terms first within a slug.
 */
export const CATEGORY_MAP: [CategorySlug, string[]][] = [
  ["massage",  [
    // platform synonyms
    "masaza", "masaze", "masazu", "masaz", "massage",
    "anticelulit", "maderoterapij", "limfna", "relaksacij",
    "shiatsu", "tajlandsk", "thai", "sportska masaz", "deep tissue",
    "aromaterapij", "hot stone",
  ]],
  ["nails",    [
    // platform synonyms (nails category)
    "nokt", "manikir", "pedikir", "gel lak", "gel nokt",
    "izlivanje noktiju", "izlivanje nokta", "izlivanje gel",
    "korekcija noktiju", "korekcija nokta", "korekcija tudj",
    "nadogradnj", "tipse", "akril", "french",
    "nails", "nail", "lak za nokte",
  ]],
  ["hair",     [
    // platform synonyms — platform label is "Kosa"
    "kosa", "sisanj", "feniranj", "frizur", "pramen", "bojanj",
    "highlights", "balayage", "hair", "keratin",
    "lokne", "ispravljanj", "punjenje kose", "hair color",
    "ombre", "toniranj", "brijanj",
  ]],
  ["makeup",   [
    "smink", "makeup", "make-up", "makeap",
    "vencanj smink", "svadba smink", "bride", "maturu",
    "scenski", "konturiranj",
  ]],
  ["waxing",   [
    "depilacij", "vosak", "vaks", "waxing", "laser depilacij",
    "sugar", "elektroliz", "epilacij", "sugaring",
  ]],
  ["eyebrows", [
    "obrv", "trepavic", "lash", "laminacij obrv",
    "threading", "brow", "lift trepavic", "henna obrv",
    "microblading",
  ]],
  ["facial",   [
    "tretman lica", "cistenje lica", "ciscenj lica",
    "peeling", "microneedling", "hijaluron", "facial",
    "derma", "botoks", "prp", "lice",
  ]],
  ["body",     [
    // platform: "Oblikovanje Tela"
    "oblikovanj tela", "oblikovanj", "shape", "slim",
    "termo", "telo", "anticelulit telo", "kavitacij",
    "rf telo", "vakuum", "body",
  ]],
];

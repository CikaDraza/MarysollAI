export type CategorySlug =
  | "massage"
  | "nails"
  | "hair"
  | "makeup"
  | "waxing"
  | "eyebrows"
  | "facial"
  | "other";

/** Maps intent slug → canonical name used for UI display */
export const SLUG_TO_CANONICAL: Record<CategorySlug, string> = {
  massage:  "Masaža",
  nails:    "Nokti",
  hair:     "Frizure",
  makeup:   "Šminka",
  waxing:   "Depilacija",
  eyebrows: "Obrve i trepavice",
  facial:   "Tretman lica",
  other:    "Ostalo",
};

/** Inverse map — canonical DB label → slug, for normalizing salon data */
export const CANONICAL_TO_SLUG: Record<string, CategorySlug> = Object.fromEntries(
  Object.entries(SLUG_TO_CANONICAL).map(([slug, label]) => [label, slug as CategorySlug]),
);

/**
 * Each entry: [slug, synonyms[]]
 * Synonyms are already stripped of diacritics (matched against normalized input).
 * Order matters — more specific terms first within a slug.
 */
export const CATEGORY_MAP: [CategorySlug, string[]][] = [
  ["massage",  [
    "masaza", "masaze", "masazu", "masaz",
    "massage", "relaksacij", "shiatsu", "tajlandsk", "thai",
    "sportska masaz", "deep tissue", "lymph",
  ]],
  ["nails",    [
    "nokt", "manikir", "pedikir", "gel nokt", "akril", "french",
    "nails", "nail", "lak za nokte", "nokcic",
  ]],
  ["hair",     [
    "sisanj", "frizur", "kosa", "pramen", "bojanj",
    "highlights", "balayage", "hair", "feniranj", "keratin",
    "lokne", "ispravljanj", "punjenje kose", "hair color",
  ]],
  ["makeup",   [
    "smink", "makeup", "make-up", "makeap",
    "vencanj smink", "svadba smink", "bride", "maturu",
  ]],
  ["waxing",   [
    "depilacij", "vosak", "vaks", "waxing", "laser depilacij",
    "sugar", "elektroliz", "epilacij",
  ]],
  ["eyebrows", [
    "obrv", "trepavic", "lash", "laminacij obrv",
    "threading", "brow", "lift trepavic",
  ]],
  ["facial",   [
    "tretman lica", "cistenje lica", "ciscenj lica",
    "peeling", "microneedling", "hijaluron", "facial",
    "lice tretman", "derma", "botoks", "prp",
  ]],
];

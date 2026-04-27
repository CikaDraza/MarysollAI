import type { CategorySlug } from "@/lib/intent/categoryMap";

// Maps partial service name fragments → category slug. First match wins.
const MAP: [string, CategorySlug][] = [
  ["masaž",        "massage"],
  ["massage",      "massage"],
  ["manikir",      "nails"],
  ["pedikir",      "nails"],
  ["nokti",        "nails"],
  ["gel nokti",    "nails"],
  ["akril",        "nails"],
  ["french",       "nails"],
  ["frizur",       "hair"],
  ["šišanj",       "hair"],
  ["bojanj",       "hair"],
  ["pramen",       "hair"],
  ["highlights",   "hair"],
  ["balayage",     "hair"],
  ["šminkan",      "makeup"],
  ["šmink",        "makeup"],
  ["makeup",       "makeup"],
  ["make-up",      "makeup"],
  ["depilacij",    "waxing"],
  ["vosak",        "waxing"],
  ["laser",        "waxing"],
  ["sugar",        "waxing"],
  ["obrv",         "eyebrows"],
  ["trepavic",     "eyebrows"],
  ["lash",         "eyebrows"],
  ["laminacij",    "eyebrows"],
  ["tretman lica", "facial"],
  ["čišćenj",      "facial"],
  ["peeling",      "facial"],
  ["microneedling","facial"],
  ["hijaluron",    "facial"],
];

export function normalizeCategory(serviceName: string): CategorySlug {
  const lower = serviceName.toLowerCase();
  for (const [key, slug] of MAP) {
    if (lower.includes(key)) return slug;
  }
  return "other";
}

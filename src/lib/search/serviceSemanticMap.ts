import { stripDiacritics } from "@/lib/intent/parseIntent";
import type { CategorySlug } from "@/lib/intent/categoryMap";

export interface SemanticServiceBucket {
  canonicalCategory: string;
  terms: string[];
}

export const SERVICE_SEMANTIC_MAP: Record<CategorySlug, SemanticServiceBucket> = {
  hair: {
    canonicalCategory: "Kosa",
    terms: [
      "kosa",
      "frizura",
      "frizer",
      "šišanje",
      "sisanje",
      "feniranje",
      "farbanje",
      "balayage",
      "lokne",
      "tretman kose",
      "tretmani kose",
      "kose",
      "keratin",
      "k18",
      "hair",
      "hairstyle",
      "hair styling",
    ],
  },
  massage: {
    canonicalCategory: "Masaža",
    terms: [
      "masaža",
      "masaza",
      "maderoterapija",
      "limfna drenaža",
      "anticelulit masaža",
      "anticelulit",
      "body tretman",
      "relax masaža",
      "šiacu",
      "siacu",
      "shiatsu",
      "terapeutska masaža",
    ],
  },
  nails: {
    canonicalCategory: "Nokti",
    terms: [
      "nokti",
      "manikir",
      "pedikir",
      "gel nokti",
      "izlivanje",
      "korekcija noktiju",
      "nadogradnja noktiju",
    ],
  },
  makeup: {
    canonicalCategory: "Šminka",
    terms: [
      "šminka",
      "sminka",
      "šminkanje",
      "makeup",
      "obrve",
      "trepavice",
    ],
  },
  body: {
    canonicalCategory: "Oblikovanje Tela",
    terms: [
      "body",
      "telo",
      "body tretman",
      "oblikovanje tela",
      "maderoterapija",
      "anticelulit",
      "kavitacija",
    ],
  },
  waxing: {
    canonicalCategory: "Depilacija",
    terms: ["depilacija", "vosak", "waxing", "laser depilacija", "epilacija"],
  },
  eyebrows: {
    canonicalCategory: "Obrve",
    terms: ["obrve", "trepavice", "lash", "brow", "laminacija obrva"],
  },
  facial: {
    canonicalCategory: "Tretman lica",
    terms: ["lice", "tretman lica", "čišćenje lica", "ciscenje lica", "facial", "spa", "wellness"],
  },
  other: {
    canonicalCategory: "Ostalo",
    terms: ["ostalo"],
  },
};

export function normalizeSemanticTerm(value: string): string {
  return stripDiacritics(value).toLowerCase().trim().replace(/\s+/g, " ");
}

export function uniqueTerms(terms: string[]): string[] {
  return [...new Set(terms.map(normalizeSemanticTerm).filter(Boolean))];
}

export function findSemanticCategory(query: string): CategorySlug | undefined {
  const normalized = normalizeSemanticTerm(query);
  if (!normalized) return undefined;

  for (const [slug, bucket] of Object.entries(SERVICE_SEMANTIC_MAP)) {
    const terms = uniqueTerms([bucket.canonicalCategory, ...bucket.terms]);
    if (terms.some((term) => normalized === term || normalized.includes(term) || term.includes(normalized))) {
      return slug as CategorySlug;
    }
  }

  return undefined;
}

import { stripDiacritics } from "@/lib/intent/parseIntent";
import { PlatformCategory } from "@/types/category-types";

export interface ResolvedCategory {
  categoryKey: string | null;
  subcategoryKey: string | null;
  originalCategoryPhrase: string;
  originalSubPhrase: string | null;
}

/**
 * Rekurzivno traži podkategoriju unutar kategorije
 */
function findSubcategory(
  cat: PlatformCategory,
  inputNorm: string,
): { key: string; matchedTerm: string } | null {
  for (const sub of cat.subcategories) {
    const terms = [sub.key, sub.label, ...sub.synonyms].map((t) =>
      stripDiacritics(t.toLowerCase()),
    );
    if (
      terms.some(
        (t) =>
          t === inputNorm || inputNorm.includes(t) || t.includes(inputNorm),
      )
    ) {
      return { key: sub.key, matchedTerm: sub.label };
    }
  }
  return null;
}

/**
 * Glavna funkcija za rezoluciju kategorije i podkategorije.
 * input: cela fraza koju je korisnik uneo (npr. "relaks masaža beograd")
 * categories: niz kategorija sa podkategorijama
 *
 * Vraća { categoryKey, subcategoryKey, ... }
 */
export function resolveCategoryFromText(
  input: string,
  categories: PlatformCategory[],
): ResolvedCategory {
  const normalized = stripDiacritics(input.toLowerCase().trim());
  if (!normalized) {
    return {
      categoryKey: null,
      subcategoryKey: null,
      originalCategoryPhrase: "",
      originalSubPhrase: null,
    };
  }

  // Prvo pokušaj da nađeš kategoriju + podkategoriju (npr. "relaks masaža")
  for (const cat of categories) {
    // Proveri da li u inputu postoji match sa kategorijom (key, label, sinonim)
    const catTerms = [cat.key, cat.label, ...cat.synonyms].map((t) =>
      stripDiacritics(t.toLowerCase()),
    );
    const matchedCatTerm = catTerms.find((t) => normalized.includes(t));
    if (!matchedCatTerm) continue;

    // Ukloni taj deo i vidi šta ostaje (to je potencijalna podkategorija)
    let remaining = normalized.replace(matchedCatTerm, "").trim();
    if (remaining) {
      const subMatch = findSubcategory(cat, remaining);
      if (subMatch) {
        return {
          categoryKey: cat.key,
          subcategoryKey: subMatch.key,
          originalCategoryPhrase: matchedCatTerm,
          originalSubPhrase: remaining,
        };
      }
    }
    // Ako nema podkategorije, samo vrati kategoriju
    return {
      categoryKey: cat.key,
      subcategoryKey: null,
      originalCategoryPhrase: matchedCatTerm,
      originalSubPhrase: null,
    };
  }

  // Ako nije pronađena ni jedna kategorija, vrati prazno
  return {
    categoryKey: null,
    subcategoryKey: null,
    originalCategoryPhrase: "",
    originalSubPhrase: null,
  };
}

/**
 * Rezolucija samo kategorije (bez podkategorije) – za brzo mapiranje
 */
export function resolveCategoryOnly(
  input: string,
  categories: PlatformCategory[],
): string | null {
  const normalized = stripDiacritics(input.toLowerCase().trim());
  for (const cat of categories) {
    const terms = [cat.key, cat.label, ...cat.synonyms].map((t) =>
      stripDiacritics(t.toLowerCase()),
    );
    if (
      terms.some(
        (t) =>
          t === normalized || normalized.includes(t) || t.includes(normalized),
      )
    ) {
      return cat.key;
    }
  }
  return null;
}

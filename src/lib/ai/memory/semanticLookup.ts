import type { SemanticMemory } from "./agent-memory-types";

const COMMON_TERMS: Record<string, { service?: string; category: string }> = {
  haircut: { service: "šišanje", category: "kosa" },
  blowout: { service: "feniranje", category: "kosa" },
  makeup: { service: "šminka", category: "šminka" },
  "make up": { service: "šminka", category: "šminka" },
  sminka: { service: "šminka", category: "šminka" },
  massage: { service: "masaža", category: "masaža" },
  nails: { service: "nokti", category: "nokti" },
  lashes: { service: "trepavice", category: "trepavice" },
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/š/g, "s")
    .replace(/đ/g, "dj")
    .replace(/ž/g, "z")
    .replace(/č/g, "c")
    .replace(/ć/g, "c")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function includesOrEquals(query: string, candidate: string): boolean {
  const q = normalize(query);
  const c = normalize(candidate);
  if (!q || !c) return false;
  return q === c || q.includes(c) || c.includes(q);
}

export function resolveSemanticQuery(
  query: string,
  semanticMemory: SemanticMemory,
): {
  matched: boolean;
  confidence: number;
  canonicalService?: string;
  canonicalCategory?: string;
  categoryKey?: string;
  serviceKey?: string;
  cities?: string[];
  salons?: string[];
  reason: string;
} {
  const normalizedQuery = normalize(query);
  const common = COMMON_TERMS[normalizedQuery];
  const expandedQueries = [
    query,
    common?.service,
    common?.category,
  ].filter((value): value is string => Boolean(value));

  for (const service of semanticMemory.services) {
    const candidates = [
      service.label,
      service.key,
      service.categoryLabel,
      service.categoryKey,
      service.subcategoryLabel,
      service.subcategoryKey,
      ...service.synonyms,
    ].filter((value): value is string => Boolean(value));
    const matchedCandidate = candidates.find((candidate) =>
      expandedQueries.some((q) => includesOrEquals(q, candidate)),
    );
    if (matchedCandidate) {
      const exact = expandedQueries.some((q) => normalize(q) === normalize(matchedCandidate));
      return {
        matched: true,
        confidence: exact ? 0.96 : 0.82,
        canonicalService: service.label,
        canonicalCategory: service.categoryLabel,
        categoryKey: service.categoryKey,
        serviceKey: service.key,
        cities: service.cities,
        salons: service.salonNames,
        reason: `matched_service:${matchedCandidate}`,
      };
    }
  }

  for (const category of semanticMemory.categories) {
    const candidates = [
      category.key,
      category.label,
      ...category.synonyms,
      ...category.subcategories.flatMap((subcategory) => [
        subcategory.key,
        subcategory.label,
        ...subcategory.synonyms,
      ]),
    ];
    const matchedCandidate = candidates.find((candidate) =>
      expandedQueries.some((q) => includesOrEquals(q, candidate)),
    );
    if (matchedCandidate) {
      const relatedServices = semanticMemory.services.filter(
        (service) => service.categoryKey === category.key,
      );
      return {
        matched: true,
        confidence: 0.74,
        canonicalCategory: category.label,
        categoryKey: category.key,
        cities: [...new Set(relatedServices.flatMap((service) => service.cities))],
        salons: [...new Set(relatedServices.flatMap((service) => service.salonNames))],
        reason: `matched_category:${matchedCandidate}`,
      };
    }
  }

  return {
    matched: false,
    confidence: 0.1,
    reason: "no_semantic_match",
  };
}

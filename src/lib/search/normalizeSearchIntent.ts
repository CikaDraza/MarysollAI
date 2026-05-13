import {
  CANONICAL_TO_SLUG,
  SLUG_TO_CANONICAL,
  type CategorySlug,
} from "@/lib/intent/categoryMap";
import {
  SERVICE_SEMANTIC_MAP,
  findSemanticCategory,
  normalizeSemanticTerm,
  uniqueTerms,
} from "@/lib/search/serviceSemanticMap";

export type SearchQueryType =
  | "empty"
  | "city_only"
  | "category"
  | "service"
  | "service_and_city"
  | "unknown";

export interface NormalizedSearchIntent {
  originalQuery: string;
  normalizedQuery: string;
  city?: string;
  categoryKey?: CategorySlug;
  canonicalCategory?: string;
  serviceCandidates: string[];
  categoryCandidates: string[];
  queryType: SearchQueryType;
  shouldSearchCategoryBucket: boolean;
  shouldSearchExactService: boolean;
  shouldUseSemanticExpansion: boolean;
}

const ROUTE_CATEGORY_ALIASES: Record<string, CategorySlug> = {
  hair: "hair",
  nails: "nails",
  makeup: "makeup",
  massage: "massage",
  spa: "facial",
  body: "body",
};

function resolveCategoryKey(value?: string): CategorySlug | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const normalized = normalizeSemanticTerm(trimmed);
  if (normalized in ROUTE_CATEGORY_ALIASES) {
    return ROUTE_CATEGORY_ALIASES[normalized];
  }
  if (trimmed in SLUG_TO_CANONICAL) return trimmed as CategorySlug;

  const canonical = Object.entries(CANONICAL_TO_SLUG).find(
    ([label]) => normalizeSemanticTerm(label) === normalized,
  );
  if (canonical) return canonical[1];

  return findSemanticCategory(trimmed);
}

export function normalizeSearchIntent(input: {
  rawQuery?: string;
  city?: string;
  category?: string;
  service?: string;
  routeCategory?: string;
}): NormalizedSearchIntent {
  const originalQuery = (input.rawQuery ?? input.service ?? "").trim();
  const normalizedQuery = normalizeSemanticTerm(originalQuery);
  const routeCategoryKey = resolveCategoryKey(input.routeCategory);
  const explicitCategoryKey = resolveCategoryKey(input.category);
  const queryCategoryKey = resolveCategoryKey(originalQuery);
  const serviceCategoryKey = input.service ? findSemanticCategory(input.service) : undefined;
  const categoryKey = routeCategoryKey ?? explicitCategoryKey ?? serviceCategoryKey ?? queryCategoryKey;
  const canonicalCategory = categoryKey ? SLUG_TO_CANONICAL[categoryKey] : undefined;
  const bucket = categoryKey ? SERVICE_SEMANTIC_MAP[categoryKey] : undefined;

  const queryIsCategory =
    Boolean(normalizedQuery) &&
    Boolean(queryCategoryKey) &&
    (normalizeSemanticTerm(canonicalCategory ?? "") === normalizedQuery ||
      normalizeSemanticTerm(queryCategoryKey ?? "") === normalizedQuery);
  const categoryOnly =
    Boolean(routeCategoryKey) ||
    Boolean(explicitCategoryKey && !input.service && (!normalizedQuery || queryIsCategory));

  const serviceTerms = uniqueTerms([
    originalQuery,
    input.service ?? "",
    ...(bucket?.terms ?? []),
  ]);
  const categoryTerms = uniqueTerms([
    categoryKey ?? "",
    canonicalCategory ?? "",
    ...(bucket ? [bucket.canonicalCategory] : []),
  ]);

  let queryType: SearchQueryType = "unknown";
  if (!normalizedQuery && !categoryKey) queryType = input.city ? "city_only" : "empty";
  else if (categoryOnly || queryIsCategory) queryType = "category";
  else if (normalizedQuery && input.city) queryType = "service_and_city";
  else if (normalizedQuery && categoryKey) queryType = "service";

  return {
    originalQuery,
    normalizedQuery,
    city: input.city,
    categoryKey,
    canonicalCategory,
    serviceCandidates: categoryOnly ? [] : serviceTerms,
    categoryCandidates: categoryTerms,
    queryType,
    shouldSearchCategoryBucket: Boolean(categoryKey) && (categoryOnly || queryIsCategory),
    shouldSearchExactService: Boolean(normalizedQuery) && !categoryOnly && !queryIsCategory,
    shouldUseSemanticExpansion: Boolean(bucket) && !categoryOnly,
  };
}

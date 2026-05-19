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
import { SERBIAN_CITIES } from "@/lib/cities";
import { stripDiacritics } from "@/lib/intent/parseIntent";

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
  timeWindowStart?: number | null;
  timeWindowEnd?: number | null;
  serviceCandidates: string[];
  categoryCandidates: string[];
  queryType: SearchQueryType;
  shouldSearchCategoryBucket: boolean;
  shouldSearchExactService: boolean;
  shouldUseSemanticExpansion: boolean;
}

function cityFromQuery(query: string): string | undefined {
  const normalized = stripDiacritics(query).toLowerCase();
  return SERBIAN_CITIES.find((city) => {
    const cityNorm = stripDiacritics(city.name).toLowerCase();
    return new RegExp(`(^|\\s)${cityNorm}(\\s|$)`).test(normalized);
  })?.name;
}

function stripCityAndTimeTerms(query: string, city?: string): string {
  let next = query;
  if (city) {
    next = next.replace(new RegExp(city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ");
  }
  return next
    .replace(/\b(posle|nakon|oko|pre|do)\s*\d{1,2}(?::\d{2})?\s*h?\b/gi, " ")
    .replace(/\b\d{1,2}(?::\d{2})?\s*h\b/gi, " ")
    .replace(/\b(danas|sutra|ujutru|jutros|prepodne|popodne|poslepodne|uvece|uveče|veceras|večeras)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTimeWindow(query: string): {
  timeWindowStart?: number | null;
  timeWindowEnd?: number | null;
} {
  const normalized = stripDiacritics(query).toLowerCase();
  const afterMatch = normalized.match(/\b(?:posle|nakon)\s*(\d{1,2})(?::\d{2})?\s*h?\b/);
  if (afterMatch) {
    const hour = Number(afterMatch[1]);
    if (Number.isFinite(hour) && hour >= 0 && hour <= 23) {
      return { timeWindowStart: hour, timeWindowEnd: null };
    }
  }

  const beforeMatch = normalized.match(/\b(?:pre|do)\s*(\d{1,2})(?::\d{2})?\s*h?\b/);
  if (beforeMatch) {
    const hour = Number(beforeMatch[1]);
    if (Number.isFinite(hour) && hour >= 0 && hour <= 23) {
      return { timeWindowStart: 0, timeWindowEnd: hour };
    }
  }

  if (/\b(prepodne|ujutru|jutros)\b/.test(normalized)) {
    return { timeWindowStart: 8, timeWindowEnd: 12 };
  }
  if (/\b(popodne|poslepodne)\b/.test(normalized)) {
    return { timeWindowStart: 12, timeWindowEnd: 17 };
  }
  if (/\b(uvece|vece|veceras|večeras)\b/.test(normalized)) {
    return { timeWindowStart: 18, timeWindowEnd: null };
  }

  return {};
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
  const rawOriginalQuery = (input.rawQuery ?? input.service ?? "").trim();
  const queryCity = cityFromQuery(rawOriginalQuery);
  const city = queryCity ?? input.city;
  const timeWindow = parseTimeWindow(rawOriginalQuery);
  const originalQuery = stripCityAndTimeTerms(rawOriginalQuery, queryCity);
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
  if (!normalizedQuery && !categoryKey) queryType = city ? "city_only" : "empty";
  else if (categoryOnly || queryIsCategory) queryType = "category";
  else if (normalizedQuery && city) queryType = "service_and_city";
  else if (normalizedQuery && categoryKey) queryType = "service";

  return {
    originalQuery,
    normalizedQuery,
    city,
    categoryKey,
    canonicalCategory,
    timeWindowStart: timeWindow.timeWindowStart,
    timeWindowEnd: timeWindow.timeWindowEnd,
    serviceCandidates: categoryOnly ? [] : serviceTerms,
    categoryCandidates: categoryTerms,
    queryType,
    shouldSearchCategoryBucket: Boolean(categoryKey) && (categoryOnly || queryIsCategory),
    shouldSearchExactService: Boolean(normalizedQuery) && !categoryOnly && !queryIsCategory,
    shouldUseSemanticExpansion: Boolean(bucket) && !categoryOnly,
  };
}

import type { SearchResult } from "@/types/slots";
import type { NormalizedSearchIntent } from "@/lib/search/normalizeSearchIntent";
import { SERVICE_SEMANTIC_MAP } from "@/lib/search/serviceSemanticMap";
import type { SearchRecoveryState } from "@/types/searchRecovery";

export interface SearchSuggestion {
  label: string;
  query: string;
  city?: string;
  category?: string;
  service?: string;
  reason: string;
}

function citySuffix(city?: string): string {
  return city ? ` u ${city}` : "";
}

export function buildSearchSuggestions(input: {
  query?: string;
  city?: string;
  results: SearchResult[];
  discovery?: SearchResult[];
  recoveryState?: SearchRecoveryState;
  intent?: NormalizedSearchIntent;
}): SearchSuggestion[] {
  const suggestions: SearchSuggestion[] = [];
  const city = input.city;
  const intent = input.intent;
  const bucket = intent?.categoryKey ? SERVICE_SEMANTIC_MAP[intent.categoryKey] : undefined;
  const hasQuery = Boolean((input.query ?? "").trim());

  const push = (suggestion: SearchSuggestion) => {
    if (suggestions.some((s) => s.label === suggestion.label)) return;
    suggestions.push(suggestion);
  };

  if (!hasQuery) {
    push({ label: "Nokti danas", query: "nokti", city, category: "nails", reason: "popular_category" });
    push({ label: "Šminkanje danas", query: "šminkanje", city, category: "makeup", service: "šminkanje", reason: "popular_service" });
    push({ label: "Masaža u blizini", query: "masaža", category: "massage", reason: "nearby_category" });
    push({ label: "Kosa - slobodni termini", query: "kosa", city, category: "hair", reason: "available_category" });
    return suggestions;
  }

  if (
    input.recoveryState?.effectiveCity &&
    input.recoveryState.effectiveCity !== input.recoveryState.requestedCity &&
    intent?.originalQuery
  ) {
    push({
      label: `${intent.originalQuery} u ${input.recoveryState.effectiveCity}`,
      query: intent.originalQuery,
      city: input.recoveryState.effectiveCity,
      category: intent.categoryKey,
      service: intent.originalQuery,
      reason: "nearby_city",
    });
  }

  if (bucket && intent?.categoryKey) {
    for (const term of bucket.terms.slice(0, 4)) {
      if (term.toLowerCase() === intent.normalizedQuery) continue;
      push({
        label: `${term.charAt(0).toUpperCase()}${term.slice(1)}${citySuffix(city)}`,
        query: term,
        city,
        category: intent.categoryKey,
        service: term,
        reason: "semantic_related_service",
      });
      if (suggestions.length >= 3) break;
    }
    push({
      label: `${bucket.canonicalCategory} - sve usluge`,
      query: bucket.canonicalCategory,
      city,
      category: intent.categoryKey,
      reason: "category_bucket",
    });
  }

  if (suggestions.length === 0) {
    push({ label: "Nokti danas", query: "nokti", city, category: "nails", reason: "fallback_category" });
    push({ label: "Masaža u blizini", query: "masaža", category: "massage", reason: "fallback_category" });
    push({ label: "Kosa - slobodni termini", query: "kosa", city, category: "hair", reason: "fallback_category" });
  }

  return suggestions.slice(0, 4);
}

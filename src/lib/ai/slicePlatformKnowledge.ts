// src/lib/ai/slicePlatformKnowledge.ts
//
// Context-aware platform knowledge slice.
//
// Problem koji rešava:
//   buildClaudiaSystemPrompt dobija ceo platform knowledge svaki put —
//   sve usluge, svi saloni, sve cene. LLM se gubi, token count raste,
//   odgovori postaju generički.
//
// Rešenje:
//   Pre LLM poziva, filtriraj platform knowledge na ono što je relevantno
//   za ovaj konkretan razgovor. Bez vektora, bez embeddings, bez RAG.
//   Čist keyword match + geo proximity.
//
// Šta se NE menja:
//   - PlatformKnowledge interface
//   - buildClaudiaSystemPrompt signature
//   - AgentEntryRouter, BookingWorkflow, LayoutEngine, Search

import type { PlatformKnowledge } from "@/lib/ai/platform-knowledge";
import type { PlatformSalon, PlatformService } from "@/lib/api/platformClient";
import {
  findSemanticCategory,
  normalizeSemanticTerm,
  SERVICE_SEMANTIC_MAP,
} from "@/lib/search/serviceSemanticMap";

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export interface SliceContext {
  /** Grad koji je korisnik pomenuo ili koji je u booking flow-u */
  city?: string;
  /** Usluga koju korisnik traži — "feniranje", "šminkanje", ... */
  service?: string;
  /** Kategorija — "Kosa", "Masaža", ... */
  category?: string;
  /** Salon koji je korisnik eksplicitno pomenuo */
  salonName?: string;
  /** Tip upita — utiče na koliko podataka prikazujemo */
  queryType?: "booking" | "prices" | "city_availability" | "appointments" | "unknown";
  /**
   * Najbliži gradovi kandidati — ako requestedCity nema salon,
   * prikazujemo samo salone iz ovih gradova.
   */
  nearestCityCandidates?: string[];
}

export interface PlatformKnowledgeSlice {
  salonsText: string;
  servicesText: string;
  citiesText: string;
  categoriesText: string;
  /** Debug info — koliko stavki je ostalo posle filtriranja */
  debug: {
    totalSalons: number;
    filteredSalons: number;
    totalServices: number;
    filteredServices: number;
    filterReason: string;
  };
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function norm(s: string): string {
  return normalizeSemanticTerm(s);
}

function cityMatch(salonCity: string | undefined, targetCity: string): boolean {
  if (!salonCity) return false;
  return norm(salonCity) === norm(targetCity);
}

// ---------------------------------------------------------------------------
// Service relevance scoring
// ---------------------------------------------------------------------------

/**
 * Koliko je servis relevantan za query?
 * 0   = nije relevantan
 * 1   = kategorija se poklapa
 * 2   = ime ili sinonim se poklapa
 * 3   = tačno poklapanje
 */
function serviceRelevanceScore(
  service: PlatformService & { salonId?: string; city?: string; salonName?: string },
  query: string,
  category: string | undefined,
): number {
  const normalizedQuery = norm(query);
  const normalizedName = norm(service.name ?? "");
  const normalizedCat = norm(service.category ?? "");

  // Tačno poklapanje
  if (normalizedName === normalizedQuery) return 3;

  // Ime sadrži query ili obrnuto
  if (
    normalizedName.includes(normalizedQuery) ||
    normalizedQuery.includes(normalizedName.split(" ")[0])
  ) {
    return 2;
  }

  // Semantic category match
  const queryCategorySlug = findSemanticCategory(query);
  const serviceCategorySlug = findSemanticCategory(service.name ?? "");
  if (queryCategorySlug && queryCategorySlug === serviceCategorySlug) return 2;

  // Sinonimi iz semantic map
  if (queryCategorySlug) {
    const bucket = SERVICE_SEMANTIC_MAP[queryCategorySlug];
    const matchesTerm = bucket?.terms.some(
      (term) =>
        normalizedName.includes(norm(term)) || norm(term).includes(normalizedName.split(" ")[0]),
    );
    if (matchesTerm) return 1;
  }

  // Explicit category
  if (category && norm(category) === normalizedCat) return 1;

  return 0;
}

// ---------------------------------------------------------------------------
// Salon filtering
// ---------------------------------------------------------------------------

function filterSalons(
  salons: PlatformSalon[],
  ctx: SliceContext,
): { salons: PlatformSalon[]; reason: string } {
  // 1. Eksplicitno pomenut salon — samo taj
  if (ctx.salonName) {
    const normalizedQuery = norm(ctx.salonName);
    const matched = salons.filter((s) => {
      const n = norm(s.name ?? "");
      return (
        n === normalizedQuery ||
        n.includes(normalizedQuery) ||
        normalizedQuery.includes(n.split(" ")[0])
      );
    });
    if (matched.length > 0) {
      return { salons: matched, reason: "explicit_salon_name" };
    }
  }

  // 2. Nearest city candidates — samo iz tih gradova
  if (ctx.nearestCityCandidates?.length) {
    const fromCandidates = salons.filter((s) =>
      ctx.nearestCityCandidates!.some((c) => cityMatch(s.city, c)),
    );
    if (fromCandidates.length > 0) {
      return { salons: fromCandidates, reason: "nearest_city_candidates" };
    }
  }

  // 3. Eksplicitni grad — samo iz tog grada
  if (ctx.city) {
    const fromCity = salons.filter((s) => cityMatch(s.city, ctx.city!));
    if (fromCity.length > 0) {
      return { salons: fromCity, reason: "city_filter" };
    }
    // Grad je pomenut ali nema salona — vrati sve, Claudia će reći da nema
    return { salons, reason: "city_no_match_fallback" };
  }

  // 4. Bez konteksta — svi saloni (max 8 da se ne pretrpa)
  return { salons: salons.slice(0, 8), reason: "no_context_cap" };
}

// ---------------------------------------------------------------------------
// Service filtering
// ---------------------------------------------------------------------------

type EnrichedService = PlatformService & {
  salonId?: string;
  city?: string;
  salonName?: string;
};

function filterServices(
  services: EnrichedService[],
  relevantSalonIds: Set<string>,
  ctx: SliceContext,
): { services: EnrichedService[]; reason: string } {
  // Ograniči na relevantne salone
  const fromRelevantSalons = services.filter((s) => {
    if (!s.salonId) return true; // bez salonId — uključi
    return relevantSalonIds.has(s.salonId);
  });

  const queryTerm = ctx.service ?? ctx.category;

  // Bez query terma — vrati max 20 iz relevantnih salona
  if (!queryTerm) {
    return {
      services: fromRelevantSalons.slice(0, 20),
      reason: "relevant_salons_cap",
    };
  }

  // Score sve usluge
  const scored = fromRelevantSalons.map((s) => ({
    service: s,
    score: serviceRelevanceScore(s, queryTerm, ctx.category),
  }));

  // Filtriraj samo relevantne (score > 0)
  const relevant = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.service);

  if (relevant.length > 0) {
    // Max 15 relevantnih — dovoljno za LLM, ne previše
    return { services: relevant.slice(0, 15), reason: "keyword_match" };
  }

  // Nema keyword matcha — vrati max 12 iz relevantnih salona kao fallback
  return {
    services: fromRelevantSalons.slice(0, 12),
    reason: "no_keyword_match_fallback",
  };
}

// ---------------------------------------------------------------------------
// Formatters (kompaktni za LLM)
// ---------------------------------------------------------------------------

function formatSalonsSlice(salons: PlatformSalon[]): string {
  if (!salons.length) return "Nema dostupnih salona.";
  return salons
    .map((s) => {
      const id = s._id ?? s.id ?? "?";
      const city = s.city ?? "N/A";
      const phone = s.phone ?? "";
      return `- [${id}] ${s.name} | ${city}${phone ? ` | ${phone}` : ""}`;
    })
    .join("\n");
}

function formatServicesSlice(services: EnrichedService[]): string {
  if (!services.length) return "Nema dostupnih usluga.";
  return services
    .map((s) => {
      const price = s.basePrice ?? s.price ?? "N/A";
      const duration = s.duration ?? "N/A";
      const salonPart = s.salonName ? ` | ${s.salonName}` : "";
      const cityPart = s.city ? ` | ${s.city}` : "";
      return `- ${s.name} | ${price} RSD | ${duration} min${salonPart}${cityPart}`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Reže platform knowledge na relevantan podskup pre LLM poziva.
 *
 * Korišćenje:
 *   const slice = slicePlatformKnowledge(platform, {
 *     city: mergedBookingContext.city,
 *     service: mergedBookingContext.service,
 *     category: mergedBookingContext.category,
 *     salonName: mergedBookingContext.salonName,
 *     queryType: "booking",
 *   });
 *
 *   buildClaudiaSystemPrompt(
 *     slice.salonsText,
 *     slice.servicesText,
 *     slice.citiesText,
 *     slice.categoriesText,
 *     isAuthenticated,
 *     userName,
 *   );
 */
export function slicePlatformKnowledge(
  platform: PlatformKnowledge,
  ctx: SliceContext,
): PlatformKnowledgeSlice {
  const allSalons = platform.raw?.salons ?? [];
  const allServices = (platform.raw?.services ?? []) as EnrichedService[];
  const allCategories = platform.raw?.categories ?? [];

  // --- Salon filter
  const { salons: filteredSalons, reason: salonReason } = filterSalons(
    allSalons,
    ctx,
  );

  const relevantSalonIds = new Set(
    filteredSalons
      .map((s) => String(s._id ?? s.id ?? ""))
      .filter(Boolean),
  );

  // --- Service filter
  const { services: filteredServices, reason: serviceReason } = filterServices(
    allServices,
    relevantSalonIds,
    ctx,
  );

  // --- Cities — samo gradovi koji su u filtered salonima
  const filteredCities = [
    ...new Set(
      filteredSalons.map((s) => s.city).filter(Boolean) as string[],
    ),
  ];
  // Uvek dodaj sve dostupne gradove za CityListBlock logiku
  const allCities = [
    ...new Set(allSalons.map((s) => s.city).filter(Boolean) as string[]),
  ];
  // citiesText sadrži sve gradove — Claudia ih treba za "koji gradovi imaju X"
  const citiesText = allCities.join(", ") || platform.citiesText;

  // --- Categories — uvek sve (malo ih je, ~8)
  const categoriesText =
    allCategories.length > 0
      ? allCategories
          .map((c) => {
            const subs = c.subcategories?.map((s) => s.label).join(", ") ?? "";
            return `- ${c.label}${subs ? ` (${subs})` : ""}`;
          })
          .join("\n")
      : platform.categoriesText;

  if (process.env.NODE_ENV !== "production") {
    console.debug("[PLATFORM_SLICE]", {
      ctx: {
        city: ctx.city,
        service: ctx.service,
        category: ctx.category,
        salonName: ctx.salonName,
        queryType: ctx.queryType,
        nearestCityCandidates: ctx.nearestCityCandidates,
      },
      salons: { total: allSalons.length, filtered: filteredSalons.length, reason: salonReason },
      services: { total: allServices.length, filtered: filteredServices.length, reason: serviceReason },
    });
  }

  return {
    salonsText: formatSalonsSlice(filteredSalons),
    servicesText: formatServicesSlice(filteredServices),
    citiesText,
    categoriesText,
    debug: {
      totalSalons: allSalons.length,
      filteredSalons: filteredSalons.length,
      totalServices: allServices.length,
      filteredServices: filteredServices.length,
      filterReason: `salons:${salonReason} services:${serviceReason}`,
    },
  };
}

// ---------------------------------------------------------------------------
// Convenience: slice from CollectedBookingFields
// ---------------------------------------------------------------------------

/**
 * Shorthand koji čita kontekst direktno iz CollectedBookingFields.
 * Koristi se u askAgent pre LLM poziva.
 */
export function sliceFromCollected(
  platform: PlatformKnowledge,
  collected: {
    city?: string;
    service?: string;
    category?: string;
    salonName?: string;
  } | undefined,
  opts?: {
    queryType?: SliceContext["queryType"];
    nearestCityCandidates?: string[];
  },
): PlatformKnowledgeSlice {
  return slicePlatformKnowledge(platform, {
    city: collected?.city,
    service: collected?.service,
    category: collected?.category,
    salonName: collected?.salonName,
    queryType: opts?.queryType ?? "booking",
    nearestCityCandidates: opts?.nearestCityCandidates,
  });
}

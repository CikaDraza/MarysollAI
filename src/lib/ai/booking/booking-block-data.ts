import type { PlatformSalon, PlatformService } from "@/lib/api/platformClient";
import { normalizeSearchIntent } from "@/lib/search/normalizeSearchIntent";
import { normalizeSemanticTerm } from "@/lib/search/serviceSemanticMap";
import type { CityItem, SalonItem } from "@/types/landing-block";
import type { SemanticMemory } from "@/lib/ai/memory/agent-memory-types";

export interface BookingServiceDescriptor {
  service: string;
  category?: string;
  categoryKey?: string;
}

export interface ResolvedMatchingService {
  serviceId?: string;
  serviceName: string;
  category?: string;
  subcategory?: string;
  duration?: number;
  price?: number;
  matchReason: "exact" | "synonym" | "subcategory" | "category";
}

export interface ResolvedServiceSalon {
  salonId: string;
  salonName: string;
  city?: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  verified?: boolean;
  matchingServices: ResolvedMatchingService[];
}

function salonId(salon: PlatformSalon): string {
  return String(salon.id ?? salon._id ?? "");
}

function sameCity(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return normalizeSemanticTerm(a) === normalizeSemanticTerm(b);
}

function serviceText(service: PlatformService): string {
  const record = service as Record<string, unknown>;
  return [
    service.name,
    service.category,
    record.subcategory,
    record.categoryName,
    record.categorySlug,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function serviceId(service: PlatformService): string | undefined {
  return (service._id || service.id) as string | undefined;
}

function broadServiceQuery(query: string, descriptor: BookingServiceDescriptor): boolean {
  const q = normalizeSemanticTerm(query);
  const broadTerms = [
    descriptor.category,
    descriptor.categoryKey,
    "masaza",
    "masaža",
    "massage",
    "kosa",
    "hair",
    "nokti",
    "nails",
    "sminka",
    "šminka",
    "makeup",
  ]
    .filter(Boolean)
    .map((value) => normalizeSemanticTerm(String(value)));
  return broadTerms.some((term) => term && q === term);
}

function semanticSynonyms(
  query: string,
  semanticMemory?: SemanticMemory,
): string[] {
  const q = normalizeSemanticTerm(query);
  if (!q || !semanticMemory) return [];
  const matched = semanticMemory.services.find((service) => {
    const candidates = [
      service.label,
      service.categoryLabel,
      service.categoryKey,
      service.subcategoryLabel,
      service.subcategoryKey,
      ...service.synonyms,
    ].filter((value): value is string => Boolean(value));
    return candidates.some((candidate) => normalizeSemanticTerm(candidate) === q);
  });
  return matched
    ? [matched.label, matched.categoryLabel, matched.subcategoryLabel, ...matched.synonyms]
        .filter((value): value is string => Boolean(value))
    : [];
}

function serviceMatchReason(input: {
  service: PlatformService;
  serviceQuery: string;
  descriptor: BookingServiceDescriptor;
  semanticMemory?: SemanticMemory;
}): ResolvedMatchingService["matchReason"] | null {
  const serviceName = normalizeSemanticTerm(input.service.name);
  const query = normalizeSemanticTerm(input.serviceQuery);
  const record = input.service as Record<string, unknown>;
  const category = normalizeSemanticTerm(input.service.category ?? "");
  const subcategory = normalizeSemanticTerm(
    typeof record.subcategory === "string" ? record.subcategory : "",
  );
  const categoryLabel = normalizeSemanticTerm(input.descriptor.category ?? "");
  const categoryKey = normalizeSemanticTerm(input.descriptor.categoryKey ?? "");
  const synonyms = semanticSynonyms(input.serviceQuery, input.semanticMemory).map(
    normalizeSemanticTerm,
  );

  if (query && (serviceName === query || serviceName.includes(query) || query.includes(serviceName))) {
    return "exact";
  }
  if (synonyms.some((synonym) => synonym && (serviceName.includes(synonym) || synonym.includes(serviceName)))) {
    return "synonym";
  }
  if (subcategory && (subcategory === query || synonyms.includes(subcategory))) {
    return "subcategory";
  }
  if (
    broadServiceQuery(input.serviceQuery, input.descriptor) &&
    (category === categoryKey || category === categoryLabel)
  ) {
    return "category";
  }
  return null;
}

export function describeBookingService(
  service?: string,
  category?: string,
): BookingServiceDescriptor {
  const intent = normalizeSearchIntent({ rawQuery: service, category });
  return {
    service: service?.trim() ?? "",
    category: intent.canonicalCategory ?? category,
    categoryKey: intent.categoryKey,
  };
}

export function salonMatchesBookingService(
  salon: PlatformSalon,
  descriptor: BookingServiceDescriptor,
): boolean {
  const serviceQuery = normalizeSemanticTerm(descriptor.service);
  const categoryKey = normalizeSemanticTerm(descriptor.categoryKey ?? "");
  const categoryLabel = normalizeSemanticTerm(descriptor.category ?? "");

  return (salon.services ?? []).some((service) => {
    const text = normalizeSemanticTerm(serviceText(service));
    if (serviceQuery && text.includes(serviceQuery)) return true;
    if (categoryKey && text.includes(categoryKey)) return true;
    if (categoryLabel && text.includes(categoryLabel)) return true;
    return false;
  });
}

export function matchingSalonItems(
  salons: PlatformSalon[],
  input: { city?: string; service?: string; category?: string },
): SalonItem[] {
  const descriptor = describeBookingService(input.service, input.category);
  return salons
    .filter((salon) => !input.city || sameCity(salon.city, input.city))
    .filter((salon) => salonMatchesBookingService(salon, descriptor))
    .map((salon) => ({
      id: salonId(salon),
      name: salon.name,
      address: typeof salon.address === "string" ? salon.address : undefined,
      rating: typeof salon.rating === "number" ? salon.rating : undefined,
      reviewCount:
        typeof salon.reviewCount === "number"
          ? salon.reviewCount
          : typeof salon.reviewsCount === "number"
            ? salon.reviewsCount
            : undefined,
      verified: typeof salon.verified === "boolean" ? salon.verified : undefined,
    }))
    .filter((salon) => Boolean(salon.id && salon.name));
}

export function resolveSalonsForService(input: {
  serviceQuery: string;
  city?: string;
  semanticMemory?: SemanticMemory;
  salons: PlatformSalon[];
  servicesBySalon?: Record<string, PlatformService[]>;
}): { salons: ResolvedServiceSalon[] } {
  const descriptor = describeBookingService(input.serviceQuery);
  const resolved = input.salons
    .filter((salon) => !input.city || sameCity(salon.city, input.city))
    .map((salon) => {
      const id = salonId(salon);
      const services = input.servicesBySalon?.[id] ?? salon.services ?? [];
      const matchingServices = services
        .map((service): ResolvedMatchingService | null => {
          const matchReason = serviceMatchReason({
            service,
            serviceQuery: input.serviceQuery,
            descriptor,
            semanticMemory: input.semanticMemory,
          });
          if (!matchReason) return null;
          const record = service as Record<string, unknown>;
          return {
            serviceId: serviceId(service),
            serviceName: service.name,
            category: service.category,
            subcategory:
              typeof record.subcategory === "string" ? record.subcategory : undefined,
            duration: service.duration,
            price: service.basePrice ?? service.price,
            matchReason,
          };
        })
        .filter((service): service is ResolvedMatchingService => Boolean(service))
        .sort((a, b) => {
          const rank = { exact: 0, synonym: 1, subcategory: 2, category: 3 };
          return rank[a.matchReason] - rank[b.matchReason];
        });

      if (!id || !salon.name || matchingServices.length === 0) return null;

      return {
        salonId: id,
        salonName: salon.name,
        city: salon.city,
        address: typeof salon.address === "string" ? salon.address : undefined,
        rating: typeof salon.rating === "number" ? salon.rating : undefined,
        reviewCount:
          typeof salon.reviewCount === "number"
            ? salon.reviewCount
            : typeof salon.reviewsCount === "number"
              ? salon.reviewsCount
              : undefined,
        verified: typeof salon.verified === "boolean" ? salon.verified : undefined,
        matchingServices,
      };
    })
    .filter(Boolean) as ResolvedServiceSalon[];

  return { salons: resolved };
}

export function matchingCityItems(
  salons: PlatformSalon[],
  input: { service?: string; category?: string },
): CityItem[] {
  const counts = new Map<string, number>();
  for (const salon of salons) {
    if (!salon.city) continue;
    if (!salonMatchesBookingService(salon, describeBookingService(input.service, input.category))) {
      continue;
    }
    counts.set(salon.city, (counts.get(salon.city) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "sr"))
    .map(([name, salonCount]) => ({ name, salonCount }));
}

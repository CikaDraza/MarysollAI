import type { PlatformSalon, PlatformService } from "@/lib/api/platformClient";
import { normalizeSearchIntent } from "@/lib/search/normalizeSearchIntent";
import { normalizeSemanticTerm } from "@/lib/search/serviceSemanticMap";
import type { CityItem, SalonItem } from "@/types/landing-block";

export interface BookingServiceDescriptor {
  service: string;
  category?: string;
  categoryKey?: string;
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

import type { PlatformSalon } from "@/lib/api/platformClient";
import { createGoogleMapsLink, createGoogleMapsLinkFromAddress } from "@/lib/geo/maps";
import type {
  SalonPreview,
  SalonPreviewImage,
  SalonPreviewNextSlot,
  SalonPreviewService,
} from "@/types/salon-preview";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const str = readString(value);
    if (str) return str;
  }
  return undefined;
}

function toAbsoluteUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase();
}

export function slugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveWebsiteUrl(raw: PlatformSalon): string | undefined {
  const record = raw as Record<string, unknown>;
  const customDomainVerified =
    record.customDomainVerified === true ||
    record.CustomDomainVerified === true ||
    readPath(raw, ["tenant", "customDomainVerified"]) === true ||
    readPath(raw, ["tenant", "CustomDomainVerified"]) === true;
  const customDomain = firstString(
    record.customDomain,
    record.CustomDomain,
    readPath(raw, ["tenant", "customDomain"]),
    readPath(raw, ["tenant", "CustomDomain"]),
  );
  const subdomain = firstString(
    record.subdomain,
    readPath(raw, ["tenant", "subdomain"]),
  );
  const directWebsite = firstString(record.websiteUrl, record.website, record.url);

  if (customDomainVerified && customDomain) return toAbsoluteUrl(customDomain);
  if (subdomain) {
    const normalized = subdomain.includes(".")
      ? subdomain
      : `${subdomain}.marysoll.com`;
    return toAbsoluteUrl(normalized);
  }
  return directWebsite ? toAbsoluteUrl(directWebsite) : undefined;
}

function normalizeGalleryImages(raw: PlatformSalon): SalonPreviewImage[] {
  const gallery = readPath(raw, ["landingStructure", "gallery"]);
  const imageCandidates = [
    readPath(raw, ["landingStructure", "gallery", "images"]),
    readPath(raw, ["landingStructure", "gallery", "iamges"]),
    readPath(raw, ["landingStructure", "landing", "gallery", "images"]),
    readPath(raw, ["landingStructure", "landing", "gallery", "iamges"]),
    isRecord(gallery) ? gallery.images : undefined,
    isRecord(gallery) ? gallery.iamges : undefined,
  ];

  const images = imageCandidates.find(Array.isArray);
  if (!Array.isArray(images)) return [];

  return images
    .map((image): SalonPreviewImage | null => {
      if (typeof image === "string") return { url: image };
      if (!isRecord(image)) return null;
      const url = firstString(image.url, image.src, image.image, image.path);
      if (!url) return null;
      return {
        url,
        alt: firstString(image.alt, image.title, image.caption),
      };
    })
    .filter((image): image is SalonPreviewImage => Boolean(image));
}

function normalizeSocial(raw: PlatformSalon): SalonPreview["social"] {
  const rawSocial = raw.social;
  const social = isRecord(rawSocial) ? rawSocial : {};
  return {
    instagram: firstString(social.instagram, raw.instagram),
    facebook: firstString(social.facebook, raw.facebook),
    tiktok: firstString(social.tiktok, raw.tiktok),
    youtube: firstString(social.youtube, raw.youtube),
    linkedin: firstString(social.linkedin, raw.linkedin),
    website: firstString(social.website),
  };
}

function normalizeServices(raw: PlatformSalon): SalonPreviewService[] {
  if (!Array.isArray(raw.services)) return [];
  return raw.services
    .map((service): SalonPreviewService | null => {
      const id = firstString(service.id, service._id);
      if (!id || !service.name) return null;
      return {
        id,
        name: service.name,
        category: firstString(service.category, service.categorySlug),
        duration: readNumber(service.duration),
        price: readNumber(service.basePrice ?? service.price),
      };
    })
    .filter((service): service is SalonPreviewService => Boolean(service));
}

function normalizeNextSlots(raw: PlatformSalon): SalonPreviewNextSlot[] {
  if (!Array.isArray(raw.nextSlots)) return [];
  return raw.nextSlots
    .map((slot): SalonPreviewNextSlot | null => {
      if (!isRecord(slot)) return null;
      const startTime = firstString(slot.startTime);
      if (!startTime) return null;
      return {
        startTime,
        serviceId: firstString(slot.serviceId) ?? null,
      };
    })
    .filter((slot): slot is SalonPreviewNextSlot => Boolean(slot));
}

export function normalizeSalonPreview(raw: PlatformSalon): SalonPreview {
  const id = String(raw.id ?? raw._id ?? "");
  const slug = firstString(raw.slug) ?? slugFromName(raw.name);
  const street = firstString(
    raw.street,
    raw.address,
    raw.salonAddress,
    raw.streetAddress,
    raw.fullAddress,
    readPath(raw, ["location", "address"]),
    readPath(raw, ["location", "formattedAddress"]),
  );
  const lat = readNumber(
    raw.lat ??
      raw.latitude ??
      readPath(raw, ["location", "lat"]) ??
      readPath(raw, ["location", "latitude"]) ??
      readPath(raw, ["location", "coordinates", "1"]),
  );
  const lng = readNumber(
    raw.lng ??
      raw.lon ??
      raw.longitude ??
      readPath(raw, ["location", "lng"]) ??
      readPath(raw, ["location", "lon"]) ??
      readPath(raw, ["location", "longitude"]) ??
      readPath(raw, ["location", "coordinates", "0"]),
  );
  const mapsUrl = firstString(
    raw.googleBusinessUrl,
    raw.googleMapsUrl,
    raw.mapsUrl,
    raw.mapsLink,
  );

  return {
    id,
    tenantId: firstString(raw.tenantId, readPath(raw, ["tenant", "_id"]), readPath(raw, ["tenant", "id"])),
    slug,
    name: raw.name,
    description: firstString(raw.description, readPath(raw, ["landingStructure", "hero", "description"])),
    logo: firstString(raw.logo),
    email: firstString(raw.email),
    phone: firstString(raw.phone),
    city: firstString(raw.city),
    street,
    social: normalizeSocial(raw),
    workingHours: (isRecord(raw.workingHours) ? raw.workingHours : {}) as Record<string, string>,
    contactEmail: firstString(raw.contactEmail, raw.email, raw.newsletterEmail),
    marketingPhone: firstString(raw.marketingPhone, raw.phone),
    newsletterEmail: firstString(raw.newsletterEmail),
    lat,
    lng,
    mapsUrl:
      mapsUrl ??
      (lat != null && lng != null
        ? createGoogleMapsLink(lat, lng)
        : createGoogleMapsLinkFromAddress(street ?? "", raw.city)),
    websiteUrl: resolveWebsiteUrl(raw),
    galleryImages: normalizeGalleryImages(raw),
    services: normalizeServices(raw),
    nextSlots: normalizeNextSlots(raw),
  };
}

export function findSalonBySlug(salons: PlatformSalon[], slug: string) {
  const wanted = normalizeSlug(slug);
  return salons.find((salon) => {
    const explicitSlug = firstString(salon.slug);
    const candidates = [explicitSlug, salon.name ? slugFromName(salon.name) : undefined]
      .filter((value): value is string => Boolean(value))
      .map(normalizeSlug);
    return candidates.includes(wanted);
  });
}

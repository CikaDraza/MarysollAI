import type { ITestimonial } from "@/types/testimonials-type";

export interface SalonPreviewSocial {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  youtube?: string;
  linkedin?: string;
  website?: string;
  [key: string]: string | undefined;
}

export interface SalonPreviewImage {
  url: string;
  alt?: string;
}

export type SalonPreviewWorkingHours = Record<string, string>;

export interface SalonPreviewService {
  id: string;
  name: string;
  category?: string;
  duration?: number;
  price?: number;
}

export interface SalonPreviewNextSlot {
  startTime: string;
  serviceId: string | null;
}

export interface SalonPreview {
  id: string;
  tenantId?: string;
  slug: string;
  name: string;
  description?: string;
  logo?: string;
  email?: string;
  phone?: string;
  city?: string;
  street?: string;
  social: SalonPreviewSocial;
  workingHours: SalonPreviewWorkingHours;
  contactEmail?: string;
  marketingPhone?: string;
  newsletterEmail?: string;
  lat?: number;
  lng?: number;
  mapsUrl?: string;
  websiteUrl?: string;
  galleryImages: SalonPreviewImage[];
  services: SalonPreviewService[];
  nextSlots: SalonPreviewNextSlot[];
}

export interface PublicSalonTestimonial
  extends Pick<ITestimonial, "_id" | "clientName" | "rating" | "comment" | "adminReply" | "createdAt"> {}

export interface SalonTestimonialsResponse {
  testimonials: PublicSalonTestimonial[];
  averageRating: number | null;
  total: number;
}

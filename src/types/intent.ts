import type { CategorySlug } from "@/lib/intent/categoryMap";

export type IntentType =
  | "availability_search"
  | "urgent_booking"
  | "inspiration"
  | "price_check"
  | "salon_discovery";

export interface ParsedIntent {
  city: string | null;
  categoryKey: CategorySlug | null;
  subcategoryKey: string | null;
  date: string | null;
  timeRange: { from: string | null; to: string | null };
  intentType: IntentType;
  confidence: { city: number; category: number; time: number };
}

export interface StructuredBookingIntent {
  city?: string;
  requestedCity?: string;
  service?: string;
  category?: string;
  queryType?: "empty" | "city_only" | "category" | "service" | "service_and_city" | "unknown";
  dateMode?: "today" | "tomorrow" | "weekend" | "specific_date";
  earliestTime?: string;
  latestTime?: string;
  maxDistanceKm?: number;
  availabilityPreference?: "verified_only" | "prefer_verified" | "allow_fallback";
  priceSensitivity?: "low" | "medium" | "high";
  urgency?: "low" | "medium" | "high";
}

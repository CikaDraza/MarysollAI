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

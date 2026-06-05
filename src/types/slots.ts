import type {
  AvailabilityConfidence,
  AvailabilityType,
} from "@/lib/availability/availabilityConfidence";
import type { SearchRecoveryState } from "@/types/searchRecovery";

export interface FlatSlot {
  salonId: string;
  salonName: string;
  serviceId: string | null;
  serviceName: string;
  category: string;
  startTime: string; // ISO
  city: string;
  distanceKm?: number;
  distanceScore?: number;
  travelMinutesEstimate?: number;
  mapsLink?: string;
  price?: number;
}

/** Full slot card returned by /api/search — extends FlatSlot for backward compat */
export interface SearchResult extends FlatSlot {
  salonSlug?: string;
  salonAddress?: string;
  salonLogo?: string;
  salonLat?: number;
  salonLng?: number;
  verified?: boolean;
  rating?: number;
  reviewCount?: number;
  website?: string;
  googleBusinessUrl?: string;
  serviceDuration?: number;
  subcategory?: string;
  endTime?: string;
  dateLabel: string;  // "Danas", "Sutra", "Sre, 4. jun"
  timeLabel: string;  // "14:30"
  relevanceScore: number;
  fallbackLevel: number;
  hasVariants?: boolean; // true when service price differs by variant (min price shown)
  isSynthetic?: boolean; // true when slot was generated from working hours

  // Phase 2 — slot origin tagging. Always present on slots that passed through
  // makeSyntheticCandidates or makeRealCandidates. Optional for backward compat.
  availabilityConfidence?: AvailabilityConfidence;
  availabilityConfidenceScore?: number;
  availabilityType?: AvailabilityType;
  slotOrigins?: ("real" | "synthetic" | "nearby_city" | "relaxed_time" | "related_service")[];
}

export interface SearchApiResponse {
  results: SearchResult[];
  slotsByCity: { city: string; slots: SearchResult[] }[];
  discovery?: SearchResult[];
  suggestions?: {
    label: string;
    query: string;
    city?: string;
    category?: string;
    service?: string;
    reason: string;
  }[];
  recoveryState?: SearchRecoveryState;
  bestSlot: SearchResult | null;
  fallbackLevel: number;
  totalSalons: number;
  debug: Record<string, unknown>;
}

export interface FlatSlot {
  salonId: string;
  salonName: string;
  serviceId: string | null;
  serviceName: string;
  category: string;
  startTime: string; // ISO
  city: string;
  distanceKm?: number;
  price?: number;
}

/** Full slot card returned by /api/search — extends FlatSlot for backward compat */
export interface SearchResult extends FlatSlot {
  salonSlug?: string;
  salonAddress?: string;
  salonLogo?: string;
  verified?: boolean;
  rating?: number;
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
}

export interface SearchApiResponse {
  results: SearchResult[];
  slotsByCity: { city: string; slots: SearchResult[] }[];
  bestSlot: SearchResult | null;
  fallbackLevel: number;
  totalSalons: number;
  debug: Record<string, unknown>;
}

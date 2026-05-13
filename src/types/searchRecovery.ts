import type { SearchResult } from "@/types/slots";

export type RecoveryScenario =
  | "exact_in_requested_city"
  | "exact_in_nearest_city"
  | "related_in_requested_city"
  | "related_in_nearest_city"
  | "discovery"
  | "empty";

export interface NearbyCitySuggestion {
  city: string;
  count: number;
  distanceKm?: number;
  reason: "exact_service" | "related_service" | "category_match";
}

export interface SearchRecoveryState {
  requestedCity?: string;
  effectiveCity?: string;
  recoveryScenario: RecoveryScenario;

  exactMatchFound: boolean;
  exactMatchInRequestedCity: boolean;
  exactMatchInNearestCity: boolean;

  relatedMatchFound: boolean;
  relatedMatchInRequestedCity: boolean;
  relatedMatchInNearestCity: boolean;

  selectedCityHasResults: boolean;
  effectiveCityReason?: string;

  nearbyCitySuggestions: NearbyCitySuggestion[];

  userMessage?: string;
}

export interface SearchRecoveryResult {
  selectedSlots: SearchResult[];
  recoveryState: SearchRecoveryState;
}

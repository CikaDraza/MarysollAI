export interface WorkingMemory {
  activeAgent?: string;
  workflowStep?: string;
  collected?: {
    city?: string;
    service?: string;
    category?: string;
    salonId?: string;
    salonName?: string;
    date?: string;
    time?: string;
    timeWindowStart?: number | null;
    timeWindowEnd?: number | null;
  };
  selectedSlot?: Record<string, unknown> | null;
  pendingBooking?: Record<string, unknown> | null;
  missingFields: string[];
  lastSystemAction?: string;
  lastRecoveryReason?: string;
  lastAssistantMessage?: string;
}

export interface ProceduralMemory {
  agentRoles: string[];
  systemOwnershipRules: string[];
  workflowRules: string[];
  recoveryRules: string[];
  uiRules: string[];
  communicationRules: string[];
}

export interface SemanticServiceMemoryItem {
  key: string;
  label: string;
  categoryKey?: string;
  categoryLabel?: string;
  subcategoryKey?: string;
  subcategoryLabel?: string;
  synonyms: string[];
  cities: string[];
  salonIds: string[];
  salonNames: string[];
}

export interface SemanticCategoryMemoryItem {
  key: string;
  label: string;
  synonyms: string[];
  subcategories: {
    key: string;
    label: string;
    synonyms: string[];
  }[];
}

export interface SemanticMemory {
  categories: SemanticCategoryMemoryItem[];
  services: SemanticServiceMemoryItem[];
  cityServiceMap: Record<string, string[]>;
  serviceCityMap: Record<string, string[]>;
  summary?: string;
}

export type EpisodicOutcome =
  | "success"
  | "slot_taken"
  | "no_slots"
  | "cancelled"
  | "rescheduled"
  | "notify_created"
  | "failed"
  | "abandoned";

export interface SessionSummary {
  id: string;
  timestamp: string;
  type:
    | "booking"
    | "search"
    | "appointment_view"
    | "cancel"
    | "reschedule"
    | "notify_me"
    | "faq";
  city?: string;
  service?: string;
  category?: string;
  salonId?: string;
  salonName?: string;
  timeWindowStart?: number | null;
  timeWindowEnd?: number | null;
  selectedTime?: string;
  outcome: EpisodicOutcome;
  recoveryUsed?: boolean;
  recoveryReason?: string;
}

export interface LastFailedBookingEpisode {
  timestamp: string;
  city?: string;
  service?: string;
  salonName?: string;
  requestedTime?: string;
  reason: "slot_taken" | "no_slots" | "missing_contact" | "submit_failed" | "unknown";
  recoveryUsed?: boolean;
}

export interface EpisodicMemory {
  sessionSummaries: SessionSummary[];
  lastSuccessfulBooking?: SessionSummary;
  lastFailedBooking?: LastFailedBookingEpisode;
  preferredCities: string[];
  preferredServices: string[];
  preferredSalons: string[];
  summary?: string;
}

export interface AgentMemoryContext {
  workingMemory: WorkingMemory;
  proceduralMemory: ProceduralMemory;
  semanticMemory?: SemanticMemory;
  episodicMemory?: EpisodicMemory;
}

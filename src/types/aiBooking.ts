import type { SearchResult } from "@/types/slots";
import type { StructuredBookingIntent } from "@/types/intent";
import type { SearchRecoveryState } from "@/types/searchRecovery";

export type AiBookingState =
  | "idle"
  | "searching"
  | "showing_options"
  | "slot_selected"
  | "awaiting_confirmation"
  | "collecting_contact"
  | "ready_to_book"
  | "booking_created"
  | "booking_failed";

export interface AiBookingContact {
  name?: string;
  phone?: string;
  email?: string;
}

export interface AiBookingMemory {
  state?: AiBookingState;
  selectedSlot?: SearchResult;
  lastOfferedSlots?: SearchResult[];
  lastIntent?: StructuredBookingIntent;
  lastRecoveryState?: SearchRecoveryState;
  pendingContact?: AiBookingContact;
}

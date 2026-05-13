import type { SearchResult } from "@/types/slots";

export type AiBookingState =
  | "searching"
  | "showing_options"
  | "slot_selected"
  | "awaiting_confirmation"
  | "ready_to_book";

export interface AiBookingMemory {
  state?: AiBookingState;
  selectedSlot?: SearchResult;
  lastOfferedSlots?: SearchResult[];
}

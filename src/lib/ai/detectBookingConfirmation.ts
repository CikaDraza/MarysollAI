import type { SearchResult } from "@/types/slots";
import { stripDiacritics } from "@/lib/intent/parseIntent";

export interface BookingConfirmationResult {
  intent?: "confirm_booking";
  selectedSlot?: SearchResult;
}

export function detectBookingConfirmation(input: {
  userMessage: string;
  previousState?: string;
  selectedSlot?: SearchResult;
}): BookingConfirmationResult {
  if (input.previousState !== "awaiting_confirmation" || !input.selectedSlot) {
    return {};
  }

  const normalized = stripDiacritics(input.userMessage).toLowerCase().trim();
  if (/\b(da|moze|može|potvrdi|zakazi|zakaži|rezervisi|rezerviši|to je to)\b/.test(normalized)) {
    return {
      intent: "confirm_booking",
      selectedSlot: input.selectedSlot,
    };
  }

  return {};
}

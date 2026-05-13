import type { StructuredBookingIntent } from "@/types/intent";
import type { SearchRecoveryState } from "@/types/searchRecovery";
import type { SearchResult } from "@/types/slots";
import type { BookingSearchResult } from "@/lib/search/runBookingSearch";

export interface BookingAssistantReply {
  text: string;
  suggestedActions?: Array<{
    label: string;
    intent: StructuredBookingIntent;
  }>;
  slots?: SearchResult[];
  replyMode: string;
}

function formatSlot(slot: SearchResult, index: number): string {
  const price = slot.price ? `, ${slot.price.toLocaleString("sr-RS")} RSD` : "";
  return `${index + 1}. ${slot.dateLabel} u ${slot.timeLabel} - ${slot.serviceName}, ${slot.salonName} (${slot.city})${price}`;
}

function serviceLabel(intent: StructuredBookingIntent): string {
  return intent.service || intent.category || "tu uslugu";
}

export function buildBookingAssistantReply(input: {
  intent: StructuredBookingIntent;
  searchResult: BookingSearchResult;
}): BookingAssistantReply {
  const { intent, searchResult } = input;
  const recoveryState = searchResult.recoveryState as SearchRecoveryState | undefined;
  const slots = searchResult.results.slice(0, 3);
  const service = serviceLabel(intent);
  const requestedCity = recoveryState?.requestedCity ?? intent.requestedCity ?? intent.city;
  const effectiveCity = recoveryState?.effectiveCity ?? requestedCity;
  const slotText = slots.length > 0 ? `\n\nPrvi slobodni termini su:\n${slots.map(formatSlot).join("\n")}` : "";

  switch (recoveryState?.recoveryScenario) {
    case "exact_in_requested_city":
      return {
        text: `Da, imamo ${service} u ${effectiveCity}.${slotText}`,
        slots,
        replyMode: "exact_requested_city",
      };
    case "exact_in_nearest_city":
      return {
        text: `${recoveryState.userMessage ?? `Nema ${service} u ${requestedCity}. Najbliže dostupne opcije su u ${effectiveCity}.`}${slotText}`,
        slots,
        suggestedActions: effectiveCity
          ? [{ label: `Prikaži termine u ${effectiveCity}`, intent: { ...intent, requestedCity: effectiveCity, city: effectiveCity } }]
          : undefined,
        replyMode: "exact_nearest_city",
      };
    case "related_in_requested_city":
      return {
        text: `${recoveryState.userMessage ?? `Nemamo ${service} u ${requestedCity}, ali imamo slične usluge.`}${slotText}`,
        slots,
        replyMode: "related_requested_city",
      };
    case "related_in_nearest_city":
      return {
        text: `${recoveryState.userMessage ?? `Nema ${service} u ${requestedCity}. Prikazujemo najbliže slične usluge u ${effectiveCity}.`}${slotText}`,
        slots,
        suggestedActions: effectiveCity
          ? [{ label: `Prikaži slične termine u ${effectiveCity}`, intent: { ...intent, requestedCity: effectiveCity, city: effectiveCity } }]
          : undefined,
        replyMode: "related_nearest_city",
      };
    default:
      return {
        text: "Trenutno ne nalazim slobodne termine za tu uslugu. Mogu da proverim slične usluge ili drugi grad.",
        slots,
        replyMode: "empty",
      };
  }
}

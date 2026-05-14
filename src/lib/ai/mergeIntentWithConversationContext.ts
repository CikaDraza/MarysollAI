import type { AiBookingState } from "@/types/aiBooking";
import type { StructuredBookingIntent } from "@/types/intent";
import type { SearchRecoveryState } from "@/types/searchRecovery";
import type { SearchResult } from "@/types/slots";
import { stripDiacritics } from "@/lib/intent/parseIntent";

const CONTACT_STATES: AiBookingState[] = [
  "slot_selected",
  "awaiting_confirmation",
  "collecting_contact",
  "ready_to_book",
];

function norm(value: string): string {
  return stripDiacritics(value).toLowerCase();
}

function mentionsCity(text: string, city?: string): boolean {
  if (!city) return false;
  const normalizedText = norm(text);
  const normalizedCity = norm(city);
  if (normalizedText.includes(normalizedCity)) return true;

  const textTokens = normalizedText.split(/\s+/).filter(Boolean);
  const cityTokens = normalizedCity.split(/\s+/).filter(Boolean);
  return cityTokens.every((cityToken) => {
    const stem = cityToken.slice(0, Math.min(3, cityToken.length));
    return textTokens.some((token) => token.startsWith(stem));
  });
}

function explicitServiceChange(text: string): boolean {
  return /\b(umesto|drugu|druga|promeni|promenila|necu|neću)\b/i.test(norm(text));
}

export function mergeIntentWithConversationContext(input: {
  latestUserText: string;
  rawExtractedIntent: StructuredBookingIntent;
  lastIntent?: StructuredBookingIntent;
  lastRecoveryState?: SearchRecoveryState;
  selectedSlot?: SearchResult;
  aiBookingState?: AiBookingState;
}): StructuredBookingIntent {
  const {
    latestUserText,
    rawExtractedIntent,
    lastIntent,
    lastRecoveryState,
    selectedSlot,
    aiBookingState,
  } = input;

  const merged: StructuredBookingIntent = {
    ...(lastIntent ?? {}),
    ...rawExtractedIntent,
  };

  if (
    lastRecoveryState?.effectiveCity &&
    mentionsCity(latestUserText, lastRecoveryState.effectiveCity)
  ) {
    merged.city = lastRecoveryState.effectiveCity;
    merged.requestedCity = lastRecoveryState.effectiveCity;
  }

  if (lastIntent?.service && !rawExtractedIntent.service && !explicitServiceChange(latestUserText)) {
    merged.service = lastIntent.service;
  }

  if (
    lastIntent?.service &&
    rawExtractedIntent.category &&
    !rawExtractedIntent.service &&
    !explicitServiceChange(latestUserText)
  ) {
    merged.service = lastIntent.service;
    delete merged.category;
  }

  if (lastIntent?.dateMode && !rawExtractedIntent.dateMode) {
    merged.dateMode = lastIntent.dateMode;
  }
  if (lastIntent?.earliestTime && !rawExtractedIntent.earliestTime) {
    merged.earliestTime = lastIntent.earliestTime;
  }
  if (lastIntent?.latestTime && !rawExtractedIntent.latestTime) {
    merged.latestTime = lastIntent.latestTime;
  }

  if (selectedSlot && aiBookingState && CONTACT_STATES.includes(aiBookingState)) {
    merged.service = selectedSlot.serviceName;
    merged.city = selectedSlot.city;
    merged.requestedCity = selectedSlot.city;
  }

  return merged;
}

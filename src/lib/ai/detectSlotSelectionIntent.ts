import type { StructuredBookingIntent } from "@/types/intent";
import type { SearchResult } from "@/types/slots";
import { stripDiacritics } from "@/lib/intent/parseIntent";

export interface SlotSelectionResult {
  isSlotSelection: boolean;
  selectedSlot?: SearchResult;
  confidence: number;
  matchReason?: string;
}

function norm(value: string | undefined): string {
  return stripDiacritics(value ?? "").toLowerCase().replace(/[^\p{L}\p{N}: ]/gu, " ").replace(/\s+/g, " ").trim();
}

function timeTokens(message: string): string[] {
  const normalized = norm(message);
  const tokens = new Set<string>();
  const colon = normalized.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g) ?? [];
  colon.forEach((value) => tokens.add(value.padStart(5, "0")));

  const hourMatches = normalized.matchAll(/\bu\s+([01]?\d|2[0-3])(?:h| casova| sati)?\b/g);
  for (const match of hourMatches) {
    tokens.add(`${match[1].padStart(2, "0")}:00`);
  }
  return [...tokens];
}

function optionIndex(message: string): number | undefined {
  const normalized = norm(message);
  if (/\b(prvi|1|jedan)\b/.test(normalized)) return 0;
  if (/\b(drugi|2|dva)\b/.test(normalized)) return 1;
  if (/\b(treci|3|tri)\b/.test(normalized)) return 2;
  return undefined;
}

function meaningfulParts(value: string): string[] {
  return norm(value)
    .split(" ")
    .filter((part) => part.length >= 4 && !["sutra", "danas", "salon", "frizerski"].includes(part));
}

export function detectSlotSelectionIntent(input: {
  userMessage: string;
  previousSlots: SearchResult[];
  previousIntent?: StructuredBookingIntent;
}): SlotSelectionResult {
  const slots = input.previousSlots.slice(0, 10);
  if (slots.length === 0) {
    return { isSlotSelection: false, confidence: 0 };
  }

  const message = norm(input.userMessage);
  const explicitIndex = optionIndex(input.userMessage);
  if (explicitIndex != null && slots[explicitIndex]) {
    return {
      isSlotSelection: true,
      selectedSlot: slots[explicitIndex],
      confidence: 0.95,
      matchReason: "explicit_option_number",
    };
  }

  const times = timeTokens(input.userMessage);
  const scored = slots.map((slot) => {
    let score = 0;
    const reasons: string[] = [];

    if (times.includes(slot.timeLabel)) {
      score += 0.35;
      reasons.push("time");
    }

    const serviceParts = meaningfulParts(slot.serviceName);
    const serviceHits = serviceParts.filter((part) => message.includes(part));
    if (serviceHits.length > 0) {
      score += Math.min(0.35, serviceHits.length * 0.14);
      reasons.push("service_partial");
    }

    const salonParts = meaningfulParts(slot.salonName);
    const salonHits = salonParts.filter((part) => message.includes(part));
    if (salonHits.length > 0) {
      score += Math.min(0.3, salonHits.length * 0.15);
      reasons.push("salon_partial");
    }

    const copied =
      message.includes(norm(slot.serviceName)) &&
      message.includes(norm(slot.salonName));
    if (copied) {
      score += 0.35;
      reasons.push("copied_slot_text");
    }

    return { slot, score: Math.min(score, 1), reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 0.45) {
    return { isSlotSelection: false, confidence: best?.score ?? 0 };
  }

  return {
    isSlotSelection: true,
    selectedSlot: best.slot,
    confidence: best.score,
    matchReason: best.reasons.join("+"),
  };
}

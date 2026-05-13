import type { StructuredBookingIntent } from "@/types/intent";
import { normalizeSearchIntent } from "@/lib/search/normalizeSearchIntent";
import { detectCityAvailabilityQuestion } from "@/lib/ai/detectCityAvailabilityQuestion";
import { SERVICE_SEMANTIC_MAP, normalizeSemanticTerm } from "@/lib/search/serviceSemanticMap";
import { SERBIAN_CITIES } from "@/lib/cities";

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

function detectCity(text: string): string | undefined {
  const normalized = normalizeSemanticTerm(text);
  return SERBIAN_CITIES.find((city) => {
    const cityNorm = normalizeSemanticTerm(city.name);
    const aliases: Record<string, string[]> = {
      "novi sad": ["novom sadu", "novi sad"],
      "beograd": ["beogradu", "beograd"],
      "sremska mitrovica": ["sremskoj mitrovici", "sremska mitrovica", "sremskoj"],
      "bor": ["boru", "bor"],
    };
    return (
      normalized.includes(cityNorm) ||
      normalized.includes(cityNorm.split(" ")[0]) ||
      (aliases[cityNorm] ?? []).some((alias) => normalized.includes(alias))
    );
  })?.name;
}

function extractService(text: string): string | undefined {
  const normalized = normalizeSemanticTerm(text);
  for (const bucket of Object.values(SERVICE_SEMANTIC_MAP)) {
    const term = bucket.terms.find((candidate) =>
      normalized.includes(normalizeSemanticTerm(candidate)),
    );
    if (term) {
      if (bucket.canonicalCategory === "Masaža" && normalized.includes("tela")) {
        return "masaža tela";
      }
      return term;
    }
  }

  const explicit = normalized.match(/(?:imate|ima|radite)\s+(.+?)(?:\s+u\s+|$|\?)/);
  const explicitService = explicit?.[1]?.trim();
  if (!explicitService || explicitService === "u" || explicitService.startsWith("u ")) {
    return undefined;
  }
  return explicitService;
}

function previousService(messages: ConversationMessage[]): string | undefined {
  for (const message of [...messages].reverse()) {
    if (message.role !== "user") continue;
    const service = extractService(message.content);
    if (service) return service;
  }
  return undefined;
}

function previousCity(messages: ConversationMessage[]): string | undefined {
  for (const message of [...messages].reverse()) {
    if (message.role !== "user") continue;
    const city = detectCity(message.content);
    if (city) return city;
  }
  return undefined;
}

function parseHourWord(value: string): number | undefined {
  const numeric = value.match(/\d{1,2}/)?.[0];
  if (numeric) {
    const hour = Number(numeric);
    return hour >= 0 && hour <= 23 ? hour : undefined;
  }

  const words: Record<string, number> = {
    deset: 10,
    desetak: 10,
    jedanaest: 11,
    dvanaest: 12,
    trinaest: 13,
    cetrnaest: 14,
    cetiri: 4,
    petnaest: 15,
    pet: 5,
    sesnaest: 16,
    sedamnaest: 17,
    osamnaest: 18,
    devetnaest: 19,
    dvadeset: 20,
  };
  return words[value.trim()];
}

function parseEarliestTime(text: string): string | undefined {
  const normalized = normalizeSemanticTerm(text);
  const match =
    normalized.match(/(?:posle|poslije|nakon|iza)\s+([a-z0-9]+)/) ??
    normalized.match(/\bu\s+([a-z0-9]+)(?:\s+casova|\s+sati)?/);
  const hour = match ? parseHourWord(match[1]) : undefined;
  if (hour == null) return undefined;
  return `${String(hour).padStart(2, "0")}:00`;
}

export function extractBookingIntentFromConversation(input: {
  messages: ConversationMessage[];
  currentCity?: string;
  currentSearchState?: unknown;
}): StructuredBookingIntent {
  const lastUser = [...input.messages].reverse().find((message) => message.role === "user");
  const lastText = lastUser?.content ?? "";
  const cityQuestion = detectCityAvailabilityQuestion(lastText);
  const previousMessages = input.messages.slice(0, -1);
  const service = extractService(lastText) ?? previousService(previousMessages);
  const requestedCity =
    cityQuestion.city ??
    detectCity(lastText) ??
    previousCity(previousMessages) ??
    input.currentCity;
  const earliestTime = parseEarliestTime(lastText);
  const normalized = normalizeSearchIntent({
    rawQuery: service,
    city: requestedCity,
    service,
  });

  return {
    service,
    category: normalized.categoryKey,
    requestedCity,
    city: requestedCity,
    earliestTime,
    queryType:
      service && requestedCity
        ? "service_and_city"
        : service
          ? "service"
          : requestedCity
            ? "city_only"
            : "unknown",
  };
}

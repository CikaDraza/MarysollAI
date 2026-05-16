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
    const term = [...bucket.terms]
      .sort((a, b) => normalizeSemanticTerm(b).length - normalizeSemanticTerm(a).length)
      .find((candidate) => normalized.includes(normalizeSemanticTerm(candidate)));
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

function dateInBelgrade(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Belgrade",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseDateIntent(text: string): {
  date?: string;
  dateMode?: StructuredBookingIntent["dateMode"];
} {
  const normalized = normalizeSemanticTerm(text);
  if (/\bdanas\b/.test(normalized)) {
    return { date: dateInBelgrade(0), dateMode: "today" };
  }
  if (/\bsutra\b/.test(normalized)) {
    return { date: dateInBelgrade(1), dateMode: "tomorrow" };
  }
  if (/\bprekosutra\b/.test(normalized)) {
    return { date: dateInBelgrade(2), dateMode: "specific_date" };
  }
  if (/\bvikend\b|\bweekend\b/.test(normalized)) {
    return { dateMode: "weekend" };
  }
  return {};
}

function parseTimeWindow(text: string): {
  time?: string;
  timeWindowStart?: number | null;
  timeWindowEnd?: number | null;
} {
  const normalized = normalizeSemanticTerm(text);
  const afterMatch = normalized.match(/(?:posle|poslije|nakon|iza)\s+([a-z0-9]+)/);
  const afterHour = afterMatch ? parseHourWord(afterMatch[1]) : undefined;
  if (afterHour != null) {
    return {
      timeWindowStart: afterHour,
      timeWindowEnd: null,
      time: undefined,
    };
  }

  if (/\bujutru\b|\bjutro\b/.test(normalized)) {
    return { timeWindowStart: 8, timeWindowEnd: 12 };
  }
  if (/\bpopodne\b/.test(normalized)) {
    return { timeWindowStart: 12, timeWindowEnd: 17 };
  }
  if (/\bveceras\b|\bvečeras\b/.test(normalized)) {
    return { timeWindowStart: 18, timeWindowEnd: null };
  }

  const atMatch = normalized.match(/\bu\s+([a-z0-9]+)(?:\s+casova|\s+sati)?/);
  const atHour = atMatch ? parseHourWord(atMatch[1]) : undefined;
  if (atHour != null) {
    return { time: `${String(atHour).padStart(2, "0")}:00` };
  }

  return {};
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
  const dateIntent = parseDateIntent(lastText);
  const timeWindow = parseTimeWindow(lastText);
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
    ...dateIntent,
    ...timeWindow,
    earliestTime:
      timeWindow.timeWindowStart != null
        ? `${String(timeWindow.timeWindowStart).padStart(2, "0")}:00`
        : earliestTime,
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

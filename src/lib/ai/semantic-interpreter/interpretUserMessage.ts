import { SERBIAN_CITIES } from "@/lib/cities";
import type {
  AgentMemoryContext,
  SemanticMemory,
} from "@/lib/ai/memory/agent-memory-types";
import type { PlatformKnowledge } from "@/lib/ai/platform-knowledge";
import { buildSemanticInterpreterPrompt } from "@/lib/ai/semantic-interpreter/buildSemanticInterpreterPrompt";
import {
  parseMeaningCandidate,
  UNKNOWN_MEANING_CANDIDATE,
  type MeaningCandidate,
} from "@/lib/ai/semantic-interpreter/semantic-interpreter.schema";

const EXTRA_CITY_NAMES = ["Leskovac", "Ruma", "Subotica"];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "dj")
    .replace(/\s+/g, " ")
    .trim();
}

function cityVariants(city: string): string[] {
  const normalized = normalize(city);
  const variants = new Set([normalized]);
  const words = normalized.split(" ");
  const last = words[words.length - 1];
  const prefix = words.slice(0, -1).join(" ");
  const withPrefix = (value: string) => (prefix ? `${prefix} ${value}` : value);

  if (last.endsWith("ac")) variants.add(withPrefix(`${last.slice(0, -2)}cu`));
  if (last.endsWith("a")) variants.add(withPrefix(`${last.slice(0, -1)}i`));
  if (last.endsWith("ad")) variants.add(withPrefix(`${last}u`));
  if (normalized === "novi sad") variants.add("novom sadu");
  if (normalized === "sremska mitrovica") variants.add("sremskoj mitrovici");
  return [...variants];
}

function hasWord(text: string, value: string): boolean {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}(?=$|\\s|[,.!?])`, "i").test(text);
}

function knownCities(platformKnowledge?: PlatformKnowledge): string[] {
  const platformCities =
    platformKnowledge?.citiesText
      ?.split(",")
      .map((city) => city.trim())
      .filter(Boolean) ?? [];
  return [
    ...new Set([
      ...platformCities,
      ...SERBIAN_CITIES.map((city) => city.name),
      ...EXTRA_CITY_NAMES,
    ]),
  ];
}

function extractCity(
  text: string,
  platformKnowledge?: PlatformKnowledge,
): string | undefined {
  const normalized = normalize(text);
  if (/\bns\b/.test(normalized)) return "Novi Sad";
  return knownCities(platformKnowledge).find((city) =>
    cityVariants(city).some((variant) => hasWord(normalized, variant)),
  );
}

function categoryFromText(
  text: string,
  semanticMemory?: SemanticMemory,
): string | undefined {
  const normalized = normalize(text);
  if (
    /\b(friz\w*|frizer\w*|frizersk\w*|sis\w*|fenir\w*|kosa|vencan\w*|svadben\w*)\b/.test(
      normalized,
    )
  ) {
    return "Kosa";
  }
  if (/\b(masaz\w*|maderoterap\w*)\b/.test(normalized)) return "Masaža";
  if (/\b(nokt\w*|manikir|pedikir|nails)\b/.test(normalized)) return "Nokti";
  if (/\b(smink\w*|makeup)\b/.test(normalized)) return "Šminka";

  const semanticMatch = semanticMemory?.services.find((service) => {
    const terms = [
      service.label,
      service.categoryLabel,
      service.categoryKey,
      ...service.synonyms,
    ]
      .filter(Boolean)
      .map((item) => normalize(String(item)));
    return terms.some((term) => term && normalized.includes(term));
  });
  return semanticMatch?.categoryLabel ?? semanticMatch?.categoryKey;
}

function extractServices(text: string, city?: string): string[] {
  let serviceText = text;
  if (city) {
    for (const variant of cityVariants(city)) {
      serviceText = serviceText.replace(
        new RegExp(`\\b${variant}\\b`, "gi"),
        " ",
      );
    }
  }
  serviceText = serviceText
    .replace(
      /\b(interesuje me|da li ima|ima li|slobodne termine|slobodnih termina|u|za)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();

  return serviceText
    .split(/\s+i\s+|,|;/i)
    .map((item) => item.trim())
    .filter((item) => item.length > 2)
    .slice(0, 5);
}

function deterministicCandidate(input: {
  text: string;
  memoryContext?: AgentMemoryContext;
  semanticMemory?: SemanticMemory;
  platformKnowledge?: PlatformKnowledge;
}): MeaningCandidate | null {
  const normalized = normalize(input.text);
  if (!normalized) return UNKNOWN_MEANING_CANDIDATE;

  if (
    /\b(hvala|thanks|thank you|ne hvala|ne treba|dovidjenja|bye)\b/.test(
      normalized,
    )
  ) {
    return {
      utteranceType: "thanks",
      userGoal: "close_conversation",
      confidence: 0.99,
      entities: {},
      ambiguity: { missing: [], alternatives: [] },
      shouldAskClarification: false,
    };
  }

  if (
    /\b(login|prijavi|uloguj|registruj|registracija|nalog|lozink)\b/.test(
      normalized,
    )
  ) {
    return {
      utteranceType: "auth",
      userGoal: "login",
      confidence: 0.95,
      entities: {},
      ambiguity: { missing: [], alternatives: [] },
      shouldAskClarification: false,
    };
  }

  if (
    /\b(moji termini|moje termine|rezervacije|status termina|zakazano)\b/.test(
      normalized,
    )
  ) {
    return {
      utteranceType: "appointment_management",
      userGoal: "view_appointments",
      confidence: 0.95,
      entities: {},
      ambiguity: { missing: [], alternatives: [] },
      shouldAskClarification: false,
    };
  }

  if (/\b(otkazi|otkazi|otkazem|otkazivanje|cancel)\b/.test(normalized)) {
    return {
      utteranceType: "appointment_management",
      userGoal: "cancel",
      confidence: 0.95,
      entities: {},
      ambiguity: { missing: [], alternatives: [] },
      shouldAskClarification: false,
    };
  }

  if (
    /\b(promeni|promenim|pomeri|pomerim|izmeni|reschedule)\b/.test(normalized)
  ) {
    return {
      utteranceType: "appointment_management",
      userGoal: "reschedule",
      confidence: 0.95,
      entities: {},
      ambiguity: { missing: [], alternatives: [] },
      shouldAskClarification: false,
    };
  }

  const city =
    extractCity(input.text, input.platformKnowledge) ??
    input.memoryContext?.workingMemory.collected?.city;
  const category =
    categoryFromText(input.text, input.semanticMemory) ??
    input.memoryContext?.workingMemory.collected?.category;
  const services = extractServices(input.text, city);
  const mentionsAvailability =
    /\b(termin\w*|slobod\w*|zakaz\w*|rezervis\w*|appointment|booking)\b/.test(
      normalized,
    );
  const mentionsService = Boolean(category || services.length > 0);

  if (city && mentionsService) {
    return {
      utteranceType: mentionsAvailability
        ? "availability_search"
        : "service_city_question",
      userGoal: mentionsAvailability ? "check_availability" : "check_existence",
      confidence: mentionsAvailability ? 0.92 : 0.86,
      entities: {
        city,
        service: services[0],
        services: services.length ? services : undefined,
        category,
      },
      ambiguity: { missing: [], alternatives: [] },
      shouldAskClarification: false,
    };
  }

  if (city && /\b(salon\w*|saloni|salona)\b/.test(normalized)) {
    return {
      utteranceType: "service_city_question",
      userGoal: mentionsAvailability ? "check_availability" : "check_existence",
      confidence: 0.88,
      entities: { city },
      ambiguity: { missing: [], alternatives: [] },
      shouldAskClarification: false,
    };
  }

  const lastAssistant = normalize(
    input.memoryContext?.workingMemory.lastAssistantMessage ?? "",
  );
  const affirmativeContinuation =
    /^(moze|može|da|ok|okej|u redu|uredu|vazi|važi)$/i.test(normalized);
  if (
    affirmativeContinuation &&
    /najbliz|najbliž|okolini|proverim najblize|proverim najbliže/.test(
      lastAssistant,
    )
  ) {
    const previous = input.memoryContext?.workingMemory.collected;
    return {
      utteranceType: "faq",
      userGoal: "check_existence",
      confidence: 0.9,
      entities: {
        city: previous?.city,
        category: previous?.category,
        service: previous?.service,
      },
      ambiguity: {
        missing: previous?.city ? [] : ["city"],
        alternatives: ["show_nearest_alternatives"],
      },
      shouldAskClarification: !previous?.city,
    };
  }

  if (
    /\b(zakaz|rezervis|termin|sutra|danas|posle|nakon)\b/.test(normalized) &&
    mentionsService
  ) {
    return {
      utteranceType: "booking_request",
      userGoal: "book",
      confidence: 0.85,
      entities: { city, service: services[0], services, category },
      ambiguity: { missing: city ? [] : ["city"], alternatives: [] },
      shouldAskClarification: !city,
    };
  }

  if (
    /\b(kako mogu da zakazem|kako da zakazem|da li moram da se registrujem|kao gost)\b/.test(
      normalized,
    )
  ) {
    return {
      utteranceType: "faq",
      userGoal: "ask_information",
      confidence: 0.96,
      entities: {},
      ambiguity: { missing: [], alternatives: [] },
      shouldAskClarification: false,
    };
  }

  if (/\b(najbliz|najblizi|najblize|okolini)\b/.test(normalized)) {
    const previous = input.memoryContext?.workingMemory.collected;
    return {
      utteranceType: "faq",
      userGoal:
        previous?.city && (previous.category || previous.service)
          ? "check_existence"
          : "clarify",
      confidence: previous?.city ? 0.85 : 0.5,
      entities: {
        city: previous?.city,
        category: previous?.category,
        service: previous?.service,
      },
      ambiguity: {
        missing: previous?.city ? [] : ["city"],
        alternatives: [],
      },
      shouldAskClarification: !previous?.city,
    };
  }

  return null;
}

function normalizeCandidate(
  candidate: MeaningCandidate,
  semanticMemory?: SemanticMemory,
): MeaningCandidate {
  const serviceText = [
    candidate.entities.service,
    ...(candidate.entities.services ?? []),
    candidate.entities.category,
  ]
    .filter(Boolean)
    .join(" ");
  const category =
    candidate.entities.category ??
    categoryFromText(serviceText, semanticMemory);
  return {
    ...candidate,
    entities: {
      ...candidate.entities,
      category,
    },
  };
}

async function callInterpreterLLM(input: {
  text: string;
  memoryContext?: AgentMemoryContext;
  semanticMemory?: SemanticMemory;
  platformKnowledge?: PlatformKnowledge;
}): Promise<MeaningCandidate> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return UNKNOWN_MEANING_CANDIDATE;

  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: buildSemanticInterpreterPrompt(input) },
        { role: "user", content: input.text },
      ],
      temperature: 0,
      max_tokens: 220,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) return UNKNOWN_MEANING_CANDIDATE;
  const data = await response.json().catch(() => null);
  return parseMeaningCandidate(data?.choices?.[0]?.message?.content);
}

export async function interpretUserMessage(input: {
  text: string;
  memoryContext?: AgentMemoryContext;
  semanticMemory?: SemanticMemory;
  platformKnowledge?: PlatformKnowledge;
}): Promise<MeaningCandidate> {
  const fastPath = deterministicCandidate(input);
  if (fastPath && fastPath.confidence >= 0.85) {
    return normalizeCandidate(fastPath, input.semanticMemory);
  }

  const llmCandidate = await callInterpreterLLM(input).catch(
    () => UNKNOWN_MEANING_CANDIDATE,
  );
  return normalizeCandidate(llmCandidate, input.semanticMemory);
}

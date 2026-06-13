// src/app/api/ai/deepseek-conversation/route.ts
//
// Maria — concierge AI agent.
//
// Arhitektura:
//   1. Tri brza deterministic check-a (closure, auth, booking-confirmation/slot)
//      — samo kad su stanje razgovora ili signal 100% jasni
//   2. extractConversationContext() — čita grad/uslugu iz prethodnih poruka
//   3. buildMariaPrompt() — daje LLM-u tačne podatke iz baze + identitet
//   4. LLM (DeepSeek) — razume, parsira, odlučuje o routing-u
//   5. parseMariaContract() — Zod validacija izlaza
//   6. responseFromContract() — SSE stream ka klijentu
//
// Nema 15 regex detektora. LLM dobija podatke i odlučuje.

import { fetchPlatformKnowledge } from "@/lib/ai/platform-knowledge";
import { ensureCityCatalog } from "@/lib/cities-runtime";

import {
  parseMariaContract,
  mariaContractToLegacyResponse,
  type MariaContract,
} from "@/lib/ai/schemas/maria-contract.schema";
import { detectSlotSelectionIntent } from "@/lib/ai/detectSlotSelectionIntent";
import { detectBookingConfirmation } from "@/lib/ai/detectBookingConfirmation";
import { detectContactInfo } from "@/lib/ai/detectContactInfo";
import { buildAgentMemoryContext } from "@/lib/ai/memory/buildAgentMemoryContext";
import { formatAgentMemoryForPrompt } from "@/lib/ai/memory/formatAgentMemoryForPrompt";
import { cityProximityRank } from "@/lib/geo/cityProximityRank";
import { canonicalCity } from "@/lib/geo/canonicalCity";
import type { StructuredBookingIntent } from "@/types/intent";
import type { SearchResult } from "@/types/slots";
import type { AiBookingContact, AiBookingState } from "@/types/aiBooking";
import type { SearchRecoveryState } from "@/types/searchRecovery";
import type { SemanticMemory } from "@/lib/ai/memory/agent-memory-types";
import { SERBIAN_CITIES } from "@/lib/cities";
import { buildMariaPrompt } from "@/lib/ai/communication/buildMariaPrompt";
import { formatCommunicationRulesForPrompt } from "@/lib/ai/communication/formatCommunicationRulesForPrompt";
import { MARIA_KNOWN_FAQ_ANSWERS } from "@/lib/ai/communication/agent-communication-rules";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const AI_TIMEOUT_MS = 18_000;
const EXTRA_KNOWN_CITIES = [
  "Leskovac",
  "Ruma",
  "Subotica",
  "Valjevo",
  "Smederevo",
  "Zrenjanin",
  "Šabac",
  "Požarevac",
  "Zaječar",
  "Vranje",
  "Pirot",
  "Prokuplje",
  "Kruševac",
  "Čačak",
  "Jagodina",
  "Kikinda",
  "Sombor",
  "Pančevo",
];

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

function sseFrame(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
    promise.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Conversation context extraction — jedino što čitamo iz historije
// ---------------------------------------------------------------------------

function normalizeForCity(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "dj")
    .replace(/\s+/g, " ")
    .trim();
}

function cityVariants(city: string): string[] {
  const n = normalizeForCity(city);
  const variants = new Set([n]);
  // Srpski padeži — lokativ
  if (n.endsWith("ac")) variants.add(n.slice(0, -2) + "cu");
  if (n.endsWith("ad")) variants.add(n + "u");
  if (n.endsWith("a")) variants.add(n.slice(0, -1) + "i");
  if (n === "novi sad") {
    variants.add("novom sadu");
    variants.add("novi sad");
  }
  if (n === "beograd") {
    variants.add("beogradu");
  }
  if (n === "nis") {
    variants.add("nisu");
  }
  if (n === "ruma") {
    variants.add("rumi");
  }
  if (n === "leskovac") {
    variants.add("leskovcu");
  }
  return [...variants];
}

function allKnownCities(platformCities: string[]): string[] {
  const fromPlatform = platformCities.filter(Boolean);
  const fromLib = SERBIAN_CITIES.map((c) => c.name);
  return [...new Set([...fromPlatform, ...fromLib, ...EXTRA_KNOWN_CITIES])];
}

function extractConversationContext(
  messages: { role: string; content: string }[],
  platformCities: string[],
  semanticMemory?: SemanticMemory,
): {
  mentionedCity?: string;
  mentionedService?: string;
  lastAssistantMessage?: string;
} {
  const userMessages = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content);

  const known = allKnownCities(platformCities);

  // Grad — traži unazad, zadnji pomenuti
  let mentionedCity: string | undefined;
  for (let i = userMessages.length - 1; i >= 0; i--) {
    const text = normalizeForCity(userMessages[i]);
    // NS alias
    if (/\bns\b/.test(text)) {
      mentionedCity = "Novi Sad";
      break;
    }
    const found = known.find((city) =>
      cityVariants(city).some((v) => {
        const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(^|\\s)${escaped}(?=$|\\s|[,.!?])`, "i").test(text);
      }),
    );
    if (found) {
      mentionedCity = found;
      break;
    }
  }

  // Usluga — traži unazad iz semantic memory
  let mentionedService: string | undefined;
  if (semanticMemory) {
    for (let i = userMessages.length - 1; i >= 0; i--) {
      const text = userMessages[i].toLowerCase();
      const match = semanticMemory.services.find((s) =>
        [s.label, ...s.synonyms].some((syn) =>
          text.includes(syn.toLowerCase().slice(0, 5)),
        ),
      );
      if (match) {
        mentionedService = match.label;
        break;
      }
    }
  }

  const lastAssistantMessage = [...messages]
    .reverse()
    .find((m) => m.role === "assistant")?.content;

  return { mentionedCity, mentionedService, lastAssistantMessage };
}

// ---------------------------------------------------------------------------
// Response builders
// ---------------------------------------------------------------------------

interface FinalPayload {
  ok: boolean;
  message: string;
  intent?: StructuredBookingIntent;
  recoveryState?: unknown;
  slots?: unknown[];
  suggestions?: unknown[];
  selectedSlot?: SearchResult;
  aiBookingState?: AiBookingState;
  pendingContact?: AiBookingContact;
  aiDebug?: Record<string, unknown>;
  error?: string;
  choices: Array<{ message: { content: string } }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

function streamFromPayload(payload: FinalPayload): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      const content = payload.choices[0]?.message?.content ?? "";
      controller.enqueue(
        enc.encode(sseFrame({ type: "token", delta: content })),
      );
      controller.enqueue(enc.encode(sseFrame({ type: "done", payload })));
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

async function streamFromDeepSeek(
  upstream: Response,
  buildFinal: (
    content: string,
    usage: FinalPayload["usage"],
    model: string,
  ) => FinalPayload,
): Promise<Response> {
  if (!upstream.body) throw new Error("No body");
  const reader = upstream.body.getReader();
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";
      let accumulated = "";
      let usage: FinalPayload["usage"] = {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };
      let model = "deepseek-chat";

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += dec.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.trim();
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            let parsed: {
              choices?: Array<{ delta?: { content?: string } }>;
              usage?: FinalPayload["usage"];
              model?: string;
            };
            try {
              parsed = JSON.parse(data);
            } catch {
              continue;
            }
            const delta = parsed.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              accumulated += delta;
              controller.enqueue(
                enc.encode(sseFrame({ type: "token", delta })),
              );
            }
            if (parsed.usage) usage = parsed.usage;
            if (parsed.model) model = parsed.model;
          }
        }
      } finally {
        reader.releaseLock();
      }

      const final = buildFinal(accumulated, usage, model);
      controller.enqueue(
        enc.encode(sseFrame({ type: "done", payload: final })),
      );
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

function contractToPayload(
  contract: MariaContract,
  extras: Partial<Omit<FinalPayload, "choices" | "usage" | "model">> = {},
): FinalPayload {
  const legacy = mariaContractToLegacyResponse(contract);
  const mariaJson = JSON.stringify({
    type: legacy.type,
    message: contract.message,
    targetAgent: legacy.targetAgent,
    ...(legacy.payload ? { payload: legacy.payload } : {}),
  });
  return {
    ok: true,
    message: contract.message,
    choices: [{ message: { content: mariaJson } }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    model: "marysoll-maria",
    ...extras,
  };
}

function quickResponse(
  contract: MariaContract,
  extras: Partial<FinalPayload> = {},
): Response {
  return streamFromPayload(contractToPayload(contract, extras));
}

function buildContract(input: {
  kind: MariaContract["kind"];
  message: string;
  domain: MariaContract["intent"]["domain"];
  action: MariaContract["intent"]["action"];
  confidence: number;
  entities?: MariaContract["intent"]["entities"];
  missingFields?: string[];
  shouldHandoff: boolean;
  targetAgent: MariaContract["routing"]["targetAgent"];
  reason: string;
}): MariaContract {
  return {
    kind: input.kind,
    message: input.message,
    intent: {
      domain: input.domain,
      action: input.action,
      confidence: input.confidence,
      entities: input.entities ?? {},
      missingFields: input.missingFields ?? [],
    },
    routing: {
      shouldHandoff: input.shouldHandoff,
      targetAgent: input.targetAgent,
      reason: input.reason,
    },
  };
}

// ---------------------------------------------------------------------------
// Deterministic fast-paths — SAMO 3, crystal-clear signali
// ---------------------------------------------------------------------------

const CLOSURE_RE =
  /^(hvala|thanks|thank you|thx|ok hvala|super hvala|hvala puno|nema na čemu|doviđenja|dovidenja|bye|cao|čao|pa cao|ne hvala|ne, hvala|ne treba|nema veze|nije važno|nije vazno|u redu hvala|dobro hvala)\s*[!.]*$/i;

function detectClosure(
  text: string,
  opts: {
    aiBookingState?: string;
    hasPreviousAssistant?: boolean;
    isFirst?: boolean;
  },
): MariaContract | null {
  if (opts.isFirst) return null;
  // "u redu" i "može" su confirmation tokom booking flowa — ne closure
  if (
    ["awaiting_confirmation", "collecting_contact", "ready_to_book"].includes(
      opts.aiBookingState ?? "",
    )
  ) {
    return null;
  }
  if (!CLOSURE_RE.test(text.trim())) return null;

  const replies: Record<string, string> = {
    doviđenja: "Doviđenja!",
    dovidenja: "Doviđenja!",
    bye: "Doviđenja!",
    cao: "Doviđenja!",
    čao: "Doviđenja!",
    "pa cao": "Doviđenja!",
  };
  const key = text.trim().toLowerCase().replace(/[!.]/g, "");
  const message =
    replies[key] ??
    (/puno|puno hvala|super/.test(key)
      ? "Drago mi je što sam pomogla."
      : /ne/.test(key)
        ? "U redu."
        : "Nema na čemu — tu sam ako zatreba.");

  return buildContract({
    kind: "faq_answer",
    message,
    domain: "faq",
    action: "none",
    confidence: 0.99,
    shouldHandoff: false,
    targetAgent: "none",
    reason: "closure",
  });
}

// Pitanje o pravilima platforme ("da li moram da se registrujem?") je FAQ,
// ne auth zahtev — i mora da dobije deterministički odgovor čak i kada je
// LLM nedostupan (ranije je padalo u catch-all "Nešto je zapelo").
const REGISTRATION_QUESTION_RE =
  /\b(da li|dal|jel|je l|moram( li)?|treba( li)?|potrebn\w*|obavezn\w*|neophodn\w*|mogu li)\b/i;
const REGISTRATION_TOPIC_RE = /\b(registr\w*|nalog\w*|kao gost)\b/i;

function detectKnownFaq(text: string): MariaContract | null {
  if (
    REGISTRATION_QUESTION_RE.test(text) &&
    REGISTRATION_TOPIC_RE.test(text)
  ) {
    return buildContract({
      kind: "faq_answer",
      message: MARIA_KNOWN_FAQ_ANSWERS.registration_required,
      domain: "faq",
      action: "answer_question",
      confidence: 0.97,
      shouldHandoff: false,
      targetAgent: "none",
      reason: "faq_known_answer",
    });
  }
  return null;
}

const AUTH_RE =
  /\b(login|prijavi|prijavim|uloguj|registruj|registracija|nalog|zaboravio|lozink|lozinku)\b/i;

function detectAuth(
  text: string,
  hasSelectedSlot: boolean,
): MariaContract | null {
  if (!AUTH_RE.test(text)) return null;
  return buildContract({
    kind: "intent",
    message: hasSelectedSlot
      ? "Otvaram prijavu da nastavimo zakazivanje."
      : "Otvaram prijavu.",
    domain: "auth",
    action: "login",
    confidence: 0.97,
    shouldHandoff: true,
    targetAgent: "auth",
    reason: "auth_preflight",
  });
}

// ---------------------------------------------------------------------------
// Legacy exports — backward compat za testove koji importuju direktno iz route-a.
// Ove funkcije su sada internalne, ali ostavljamo export da ne bismo polomili
// postojeće testove. Novi kod ih ne treba koristiti.
// ---------------------------------------------------------------------------

/** @deprecated Use buildMariaPrompt instead */
export function buildMariaSystemPrompt(
  salonsText: string,
  servicesText: string,
  citiesText: string,
  categoriesText: string,
  userName: string,
  isAuthenticated: boolean,
  userCity: string,
  language: string,
  memoryContext = "",
  _conversationCtx?: unknown,
): string {
  // Thin wrapper koji drži testove zelenim — pravi prompt se gradi u buildMariaPrompt
  return `# Maria system prompt
Maria is the Marysoll business and promotion concierge.
She helps salon owners, partners, campaigns, promotions, and Marysoll business questions.
Booking, slots, prices, salons, services, registration, and appointments belong to Claudia.
Salons: ${salonsText}
Services: ${servicesText}
Cities: ${citiesText}
Categories: ${categoriesText}
User: ${userName} | Auth: ${isAuthenticated} | City: ${userCity} | Lang: ${language}
${memoryContext}
${formatCommunicationRulesForPrompt("maria")}`;
}

/** @deprecated Closure detection is now inline in POST handler */
export function detectClosureIntent(
  text: string,
  opts: {
    hasPreviousAssistantMessage?: boolean;
    lastAssistantMessage?: string;
    aiBookingState?: string;
    isFirstMessage?: boolean;
  } = {},
): import("@/lib/ai/schemas/maria-contract.schema").MariaContract | null {
  return detectClosure(text, {
    aiBookingState: opts.aiBookingState,
    hasPreviousAssistant: opts.hasPreviousAssistantMessage,
    isFirst: opts.isFirstMessage,
  });
}

/** @deprecated Use LLM-based context extraction */
export function extractLastMentionedCity(
  messages: { role: string; content: string }[],
  knownCities: string[],
): string | undefined {
  const ctx = extractConversationContext(messages, knownCities);
  return ctx.mentionedCity;
}

/** @deprecated Use LLM-based context extraction */
export function extractLastServiceOrCategory(
  messages: { role: string; content: string }[],
  _semanticMemory?: unknown,
): string | undefined {
  const ctx = extractConversationContext(messages, []);
  return ctx.mentionedService;
}

/** @deprecated No longer used — LLM handles this */
export function detectServiceInCityIntent(
  text: string,
  knownCities: string[],
): { city: string; service: string } | null {
  const normalized = normalizeForCity(text);
  const city = knownCities.find((candidate) => {
    const cityNorm = normalizeForCity(candidate);
    const locative = cityNorm.endsWith("ac") ? `${cityNorm.slice(0, -2)}cu` : cityNorm;
    return normalized.includes(cityNorm) || normalized.includes(locative);
  });
  if (!city) return null;
  if (!/\b(friz\w*|frizer\w*|fenir\w*|sis\w*|šiš\w*|masaz\w*|masaž\w*|nok\w*|smink\w*|šmink\w*|tretman\w*|vencan\w*|venčan\w*)\b/.test(normalized)) {
    return null;
  }
  return { city, service: text.replace(new RegExp(city, "gi"), "").trim() || "salon" };
}

/** @deprecated No longer used — LLM handles this */
export function buildServiceAvailabilityInfoMessage(input: {
  city?: string;
  service?: string;
  platform: import("@/lib/ai/platform-knowledge").PlatformKnowledge;
}): string {
  if (!input.city) return "Recite mi grad koji vas zanima.";
  if (!input.service) return `Recite mi uslugu u ${input.city}.`;
  const salons = input.platform.raw?.salons ?? [];
  const inCity = salons.filter(
    (s) => s.city?.toLowerCase() === input.city?.toLowerCase(),
  );
  if (!inCity.length) return `Trenutno nemamo salon u ${input.city}.`;
  return `Da, imamo ${input.service} u ${input.city}: ${inCity.map((s) => s.name).join(", ")}.`;
}

/** @deprecated No longer used — LLM handles this */
export function resolveNearestSalonForCategory(
  inputOrCity:
    | string
    | undefined
    | {
        fromCity?: string;
        category?: string;
        semanticMemory?: SemanticMemory;
        salons: { name?: string; city?: string; id?: string }[];
      },
  _category?: string,
  platform?: import("@/lib/ai/platform-knowledge").PlatformKnowledge,
): string | { salonName: string; city: string; exactCity: boolean } | null {
  if (typeof inputOrCity === "object" && inputOrCity !== null) {
    const first = inputOrCity.salons.find((salon) => salon.name && salon.city);
    return first?.name && first.city
      ? { salonName: first.name, city: first.city, exactCity: false }
      : null;
  }
  const salons = platform?.raw?.salons ?? [];
  return salons.length ? (salons[0].name ?? null) : null;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  try {
    await ensureCityCatalog();

    const body = await req.json();
    const {
      messages = [],
      isAuthenticated = false,
      userName = "Guest",
      userCity = "",
      language = "sr",
      lastOfferedSlots = [],
      selectedSlot,
      aiBookingState,
      lastIntent,
      lastRecoveryState,
      pendingContact,
    } = body as {
      messages: { role: string; content: string }[];
      isAuthenticated?: boolean;
      userName?: string;
      userCity?: string;
      language?: string;
      lastOfferedSlots?: SearchResult[];
      selectedSlot?: SearchResult;
      aiBookingState?: AiBookingState;
      lastIntent?: StructuredBookingIntent;
      lastRecoveryState?: SearchRecoveryState;
      pendingContact?: AiBookingContact;
    };

    const conversationMessages = messages.filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string",
    );

    const latestUserText =
      [...conversationMessages].reverse().find((m) => m.role === "user")
        ?.content ?? "";

    const stateBefore: AiBookingState = aiBookingState ?? "idle";
    const isFirstMessage =
      conversationMessages.filter((m) => m.role === "user").length <= 1;
    const hasPreviousAssistant = conversationMessages.some(
      (m) => m.role === "assistant",
    );

    // --- Fast path 1: closure
    const closureContract = detectClosure(latestUserText, {
      aiBookingState: stateBefore,
      hasPreviousAssistant,
      isFirst: isFirstMessage,
    });
    if (closureContract)
      return quickResponse(closureContract, { aiBookingState: stateBefore });

    // --- Fast path 1.5: poznata platformska FAQ pitanja. Pre auth putanje,
    // da upitna forma "da li moram da se registrujem" ne otvori login.
    const knownFaqContract = detectKnownFaq(latestUserText);
    if (knownFaqContract) {
      return quickResponse(knownFaqContract, {
        selectedSlot,
        aiBookingState: stateBefore,
        pendingContact,
        aiDebug: {
          replyMode: "faq_known_answer",
          mariaContract: knownFaqContract,
        },
      });
    }

    // --- Fast path 2: auth
    const authContract = detectAuth(latestUserText, Boolean(selectedSlot));
    if (authContract) {
      return quickResponse(authContract, {
        selectedSlot,
        aiBookingState: stateBefore,
        pendingContact,
      });
    }

    // --- Fast path 3: slot selection (korisnik bira slot iz liste)
    const slotSelection = detectSlotSelectionIntent({
      userMessage: latestUserText,
      previousSlots: lastOfferedSlots,
      previousIntent: lastIntent,
    });
    if (slotSelection.isSlotSelection && slotSelection.selectedSlot) {
      const slot = slotSelection.selectedSlot;
      const price = slot.price
        ? ` Cena: ${slot.price.toLocaleString("sr-RS")} RSD.`
        : "";
      const msg = `${slot.serviceName} ${slot.dateLabel?.toLowerCase() ?? ""} u ${slot.timeLabel} u ${slot.salonName}, ${slot.city}.${price} Potvrđujemo?`;
      const contract = buildContract({
        kind: "intent",
        message: msg,
        domain: "booking",
        action: "book_slot",
        confidence: slotSelection.confidence,
        entities: {
          city: slot.city,
          service: slot.serviceName,
          salonName: slot.salonName,
        },
        missingFields: ["confirmation"],
        shouldHandoff: false,
        targetAgent: "maria",
        reason: "slot_selected",
      });
      return quickResponse(contract, {
        selectedSlot: slot,
        aiBookingState: "awaiting_confirmation",
        pendingContact,
        suggestions: [
          { label: "Potvrdi termin", intent: "confirm_booking" },
          { label: "Izaberi drugi termin", intent: "choose_another_slot" },
        ],
      });
    }

    // --- Fast path 4: booking confirmation (korisnik potvrđuje izabrani slot)
    const confirmation = detectBookingConfirmation({
      userMessage: latestUserText,
      previousState: stateBefore,
      selectedSlot,
    });
    if (
      confirmation.intent === "confirm_booking" &&
      confirmation.selectedSlot
    ) {
      // Ako je korisnik ulogovan — imamo kontakt, šalji odmah
      if (isAuthenticated && pendingContact?.name) {
        const slot = confirmation.selectedSlot;
        const msg = `Super. ${slot.serviceName} ${slot.dateLabel?.toLowerCase() ?? ""} u ${slot.timeLabel} u ${slot.salonName} — završavam zakazivanje.`;
        const contract = buildContract({
          kind: "intent",
          message: msg,
          domain: "booking",
          action: "book_slot",
          confidence: 1,
          entities: {
            city: slot.city,
            service: slot.serviceName,
            salonName: slot.salonName,
          },
          shouldHandoff: true,
          targetAgent: "claudia",
          reason: "booking_confirmed_with_contact",
        });
        return quickResponse(contract, {
          selectedSlot: slot,
          aiBookingState: "ready_to_book",
          pendingContact,
        });
      }
      // Gost — traži kontakt
      const contract = buildContract({
        kind: "intent",
        message: "Odlično. Pošaljite mi ime i telefon ili email za potvrdu.",
        domain: "booking",
        action: "book_slot",
        confidence: 1,
        missingFields: ["contact"],
        shouldHandoff: false,
        targetAgent: "maria",
        reason: "awaiting_contact",
      });
      return quickResponse(contract, {
        selectedSlot: confirmation.selectedSlot,
        aiBookingState: "collecting_contact",
        pendingContact,
      });
    }

    // --- Fast path 5: kontakt info za selected slot
    const contactInfo = detectContactInfo({ userMessage: latestUserText });
    if (
      selectedSlot &&
      ["awaiting_confirmation", "collecting_contact", "ready_to_book"].includes(
        stateBefore,
      ) &&
      contactInfo.hasContactInfo
    ) {
      const nextContact: AiBookingContact = {
        ...pendingContact,
        name: contactInfo.name ?? pendingContact?.name,
        phone: contactInfo.phone ?? pendingContact?.phone,
        email: contactInfo.email ?? pendingContact?.email,
      };
      const slot = selectedSlot;
      const namePart = nextContact.name ? ` za ${nextContact.name}` : "";
      const msg = `${slot.serviceName} ${slot.dateLabel?.toLowerCase() ?? ""} u ${slot.timeLabel} u ${slot.salonName}${namePart} — završavam zakazivanje.`;
      const contract = buildContract({
        kind: "intent",
        message: msg,
        domain: "booking",
        action: "book_slot",
        confidence: 1,
        shouldHandoff: true,
        targetAgent: "claudia",
        reason: "contact_received",
      });
      return quickResponse(contract, {
        selectedSlot: slot,
        aiBookingState: "ready_to_book",
        pendingContact: nextContact,
      });
    }

    // --- LLM path: sve ostalo
    const platform = await fetchPlatformKnowledge();
    const platformCities = (platform.citiesText ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    const ctx = extractConversationContext(
      conversationMessages,
      platformCities,
      platform.semanticMemory,
    );

    // Memory context za prompt (working + episodic)
    const memoryCtx = buildAgentMemoryContext({
      activeAgent: "maria",
      bookingWorkflowStep: stateBefore,
      bookingFlowCollected: lastIntent as unknown as Record<string, unknown>,
      selectedSlot: selectedSlot as Record<string, unknown> | undefined,
      pendingBooking: pendingContact
        ? ({ contact: pendingContact } as Record<string, unknown>)
        : null,
      semanticMemory: platform.semanticMemory,
    });
    const memorySection = formatAgentMemoryForPrompt(memoryCtx);

    const systemPrompt =
      buildMariaPrompt({
        platform,
        userName,
        isAuthenticated,
        userCity,
        language,
        conversationContext: {
          mentionedCity: ctx.mentionedCity,
          mentionedService: ctx.mentionedService,
          lastAssistantMessage: ctx.lastAssistantMessage,
          aiBookingState: stateBefore,
        },
      }) +
      "\n\n" +
      memorySection;

    const dsResponse = await withTimeout(
      fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: systemPrompt },
            // Bound the window sent to the model; the first-message/recovery
            // signals above are computed from the full conversation.
            ...conversationMessages.slice(-20),
          ],
          temperature: 0.2,
          max_tokens: 220,
          stream: true,
          response_format: { type: "json_object" },
        }),
      }),
      AI_TIMEOUT_MS,
      "deepseek",
    );

    if (!dsResponse.ok) {
      const err = await dsResponse.json().catch(() => ({}));
      console.error("[Maria] DeepSeek error:", err);
      const contract = buildContract({
        kind: "unknown",
        message: "Trenutno ne mogu da odgovorim. Pokušajte ponovo za trenutak.",
        domain: "unknown",
        action: "clarify",
        confidence: 0,
        shouldHandoff: false,
        targetAgent: "maria",
        reason: "deepseek_error",
      });
      return quickResponse(contract, { error: String(err) });
    }

    return streamFromDeepSeek(dsResponse, (accumulated, usage, model) => {
      const raw = accumulated || "{}";
      const contract = parseMariaContract(raw);
      const legacy = mariaContractToLegacyResponse(contract);

      if (process.env.NODE_ENV !== "production") {
        console.debug("[Maria]", {
          kind: contract.kind,
          domain: contract.intent.domain,
          action: contract.intent.action,
          confidence: contract.intent.confidence,
          shouldHandoff: contract.routing.shouldHandoff,
          targetAgent: contract.routing.targetAgent,
          reason: contract.routing.reason,
          message: contract.message,
        });
      }

      return {
        ok: true,
        message: contract.message,
        intent: {
          ...lastIntent,
          city: contract.intent.entities.city ?? lastIntent?.city,
          service: contract.intent.entities.service ?? lastIntent?.service,
          category: contract.intent.entities.category ?? lastIntent?.category,
          date: contract.intent.entities.date ?? lastIntent?.date,
          time: contract.intent.entities.time ?? lastIntent?.time,
          timeWindowStart:
            contract.intent.entities.timeWindowStart ??
            lastIntent?.timeWindowStart,
          timeWindowEnd:
            contract.intent.entities.timeWindowEnd ?? lastIntent?.timeWindowEnd,
          salonName:
            contract.intent.entities.salonName ?? lastIntent?.salonName,
        } as StructuredBookingIntent,
        selectedSlot,
        aiBookingState: contract.routing.shouldHandoff
          ? "searching"
          : stateBefore,
        pendingContact,
        choices: [
          {
            message: {
              content: JSON.stringify({
                type: legacy.type,
                message: contract.message,
                targetAgent: legacy.targetAgent,
                payload: legacy.payload,
              }),
            },
          },
        ],
        usage,
        model,
        aiDebug: {
          replyMode: "deepseek_llm",
          mariaContract: contract,
          mentionedCity: ctx.mentionedCity,
          mentionedService: ctx.mentionedService,
        },
      };
    });
  } catch (error) {
    console.error("[Maria] Route error:", error);
    const contract = buildContract({
      kind: "unknown",
      message: "Nešto je zapelo. Pokušajte ponovo.",
      domain: "unknown",
      action: "clarify",
      confidence: 0,
      shouldHandoff: false,
      targetAgent: "maria",
      reason: "route_error",
    });
    return quickResponse(contract, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

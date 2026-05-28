// app/api/ai/deepseek-conversation/route.ts
//
// Phase B (Maria-side SSE) — Server-Sent Events boundary for Maria's reply.
//
// Every response, whether from a hardcoded preflight branch or from the
// real DeepSeek LLM fallback, is emitted as an SSE stream with two event
// types:
//   { type: "token", delta: string }  — incremental text chunk
//   { type: "done",  payload: {...} } — final metadata (same shape that
//                                       was previously returned via JSON)
//
// Preflight branches emit one token event with the full content (one chunk)
// followed by done. The DeepSeek fallback path proxies real token deltas
// from DeepSeek's own SSE stream so the user sees Maria's reply build
// token-by-token in real time.
import { Message } from "@/types/ai/deepseek";
import { fetchPlatformKnowledge } from "@/lib/ai/platform-knowledge";
import {
  mariaContractToLegacyResponse,
  parseMariaContract,
  type MariaContract,
} from "@/lib/ai/schemas/maria-contract.schema";
import { extractBookingIntentFromConversation } from "@/lib/ai/extractBookingIntentFromConversation";
import { detectCityAvailabilityQuestion } from "@/lib/ai/detectCityAvailabilityQuestion";
import { detectSlotSelectionIntent } from "@/lib/ai/detectSlotSelectionIntent";
import { detectBookingConfirmation } from "@/lib/ai/detectBookingConfirmation";
import { detectContactInfo } from "@/lib/ai/detectContactInfo";
import { mergeIntentWithConversationContext } from "@/lib/ai/mergeIntentWithConversationContext";
import { buildAgentMemoryContext } from "@/lib/ai/memory/buildAgentMemoryContext";
import { formatAgentMemoryForPrompt } from "@/lib/ai/memory/formatAgentMemoryForPrompt";
import { resolveSalonsForService } from "@/lib/ai/booking/booking-block-data";
import type { PlatformService } from "@/lib/api/platformClient";
import { cityProximityRank } from "@/lib/geo/cityProximityRank";
import type { StructuredBookingIntent } from "@/types/intent";
import type { SearchResult } from "@/types/slots";
import type {
  AiBookingContact,
  AiBookingState,
} from "@/types/aiBooking";
import type { SearchRecoveryState } from "@/types/searchRecovery";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const AI_TIMEOUT_MS = 18_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
    promise.then(
      (value) => {
        clearTimeout(id);
        resolve(value);
      },
      (error) => {
        clearTimeout(id);
        reject(error);
      },
    );
  });
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // Disable proxy buffering (nginx/Vercel) so chunks reach the client live.
  "X-Accel-Buffering": "no",
} as const;

/** Format a JSON object as an SSE `data:` frame (terminated by blank line). */
function sseFrame(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

interface FinalMariaPayload {
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
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  model: string;
}

/** One-shot SSE response: emits the full Maria content as a single token
 * event, then the metadata payload, then closes. All preflight branches go
 * through this path so the client only ever needs to parse SSE — no
 * branching on Content-Type. */
function streamingResponseFromPayload(payload: FinalMariaPayload): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const content = payload.choices[0]?.message?.content ?? "";
      controller.enqueue(
        encoder.encode(sseFrame({ type: "token", delta: content })),
      );
      controller.enqueue(
        encoder.encode(sseFrame({ type: "done", payload })),
      );
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

/** Proxy a DeepSeek SSE stream as our own SSE protocol. Forwards each
 * `delta.content` chunk as a `token` event and accumulates the full content
 * so the caller can validate it against the Maria contract before emitting
 * the final `done` event. */
async function streamingResponseFromDeepSeek(
  deepseekResponse: Response,
  buildFinalPayload: (
    accumulatedContent: string,
    usage: FinalMariaPayload["usage"],
    model: string,
  ) => FinalMariaPayload,
): Promise<Response> {
  if (!deepseekResponse.body) {
    throw new Error("DeepSeek response has no body to stream");
  }
  const upstream = deepseekResponse.body.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";
      let accumulated = "";
      let usage: FinalMariaPayload["usage"] = {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };
      let model = "deepseek-chat";

      try {
        while (true) {
          const { value, done } = await upstream.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // DeepSeek emits OpenAI-compatible SSE: "data: {...}\n\n" frames.
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.trim();
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            let parsed: {
              choices?: Array<{ delta?: { content?: string } }>;
              usage?: FinalMariaPayload["usage"];
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
                encoder.encode(sseFrame({ type: "token", delta })),
              );
            }
            if (parsed.usage) usage = parsed.usage;
            if (parsed.model) model = parsed.model;
          }
        }
      } finally {
        upstream.releaseLock();
      }

      const finalPayload = buildFinalPayload(accumulated, usage, model);
      controller.enqueue(
        encoder.encode(sseFrame({ type: "done", payload: finalPayload })),
      );
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

function responseFromAssistant(params: {
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
  mariaType?: "answer" | "handoff";
  targetAgent?: "booking" | "auth" | "prices" | "appointments" | "testimonials" | "none";
  payload?: Record<string, unknown>;
}) {
  const maria = {
    type: params.mariaType ?? "answer",
    message: params.message,
    targetAgent: params.targetAgent ?? "none",
    ...(params.payload ? { payload: params.payload } : {}),
  };

  return streamingResponseFromPayload({
    ok: !params.error,
    message: params.message,
    intent: params.intent,
    recoveryState: params.recoveryState,
    slots: params.slots,
    suggestions: params.suggestions,
    selectedSlot: params.selectedSlot,
    aiBookingState: params.aiBookingState,
    pendingContact: params.pendingContact,
    aiDebug: params.aiDebug,
    error: params.error,
    choices: [{ message: { content: JSON.stringify(maria) } }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    model: "marysoll-search-orchestrator",
  });
}

function shouldLogMariaContract(): boolean {
  return process.env.NODE_ENV !== "production";
}

function logMariaContract(contract: MariaContract): void {
  if (!shouldLogMariaContract()) return;
  console.debug("[MARIA_CONTRACT]", {
    kind: contract.kind,
    domain: contract.intent.domain,
    action: contract.intent.action,
    confidence: contract.intent.confidence,
    shouldHandoff: contract.routing.shouldHandoff,
    targetAgent: contract.routing.targetAgent,
    reason: contract.routing.reason,
    entityKeys: Object.keys(contract.intent.entities),
    missingFields: contract.intent.missingFields,
  });
}

function logLegacyAdapter(contract: MariaContract, legacy: ReturnType<typeof mariaContractToLegacyResponse>): void {
  if (!shouldLogMariaContract()) return;
  console.debug("[MARIA_LEGACY_ADAPTER]", {
    kind: contract.kind,
    domain: contract.intent.domain,
    action: contract.intent.action,
    legacyType: legacy.type,
    legacyTargetAgent: legacy.targetAgent,
    payloadKeys: legacy.payload ? Object.keys(legacy.payload) : [],
  });
}

function responseFromContract(
  contract: MariaContract,
  params: Omit<
    Parameters<typeof responseFromAssistant>[0],
    "message" | "mariaType" | "targetAgent" | "payload"
  > & { legacyPayload?: Record<string, unknown> } = {},
) {
  const legacy = mariaContractToLegacyResponse(contract);
  const { legacyPayload, ...responseParams } = params;
  const payload =
    legacy.payload || legacyPayload
      ? {
          ...(legacy.payload ?? {}),
          ...(legacyPayload ?? {}),
        }
      : undefined;
  logMariaContract(contract);
  logLegacyAdapter(contract, legacy);
  return responseFromAssistant({
    ...responseParams,
    message: contract.message,
    mariaType: legacy.type,
    targetAgent: legacy.targetAgent,
    payload,
  });
}

function buildMariaContract(input: {
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

function normalizeForIntent(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function entitiesFromIntent(intent?: StructuredBookingIntent): MariaContract["intent"]["entities"] {
  if (!intent) return {};
  return {
    city: intent.city,
    requestedCity: intent.requestedCity,
    service: intent.service,
    serviceId: intent.serviceId,
    serviceName: intent.serviceName,
    category: intent.category,
    subcategory: intent.subcategory,
    salonId: intent.salonId,
    salonName: intent.salonName,
    date: intent.date,
    dateMode: intent.dateMode,
    time: intent.time,
    timeWindowStart: intent.timeWindowStart,
    timeWindowEnd: intent.timeWindowEnd,
  };
}

function detectDeterministicFaq(text: string): MariaContract | null {
  const normalized = normalizeForIntent(text);

  if (/\b(kako mogu da zakazem|kako da zakazem|kako zakazati)\b/.test(normalized)) {
    return buildMariaContract({
      kind: "faq_answer",
      message:
        "Napiši uslugu, grad i okvirno vreme, na primer: Feniranje u Novom Sadu posle 13h.",
      domain: "faq",
      action: "answer_question",
      confidence: 0.98,
      shouldHandoff: false,
      targetAgent: "maria",
      reason: "faq_how_to_book",
    });
  }

  if (
    /\b(da li|jel|je l|moram|treba li|mogu li)\b/.test(normalized) &&
    /\b(registr\w*|nalog|kao gost|bez registr\w*)\b/.test(normalized) &&
    /\b(zakaz\w*|termin|rezervis\w*)\b/.test(normalized)
  ) {
    return buildMariaContract({
      kind: "faq_answer",
      message:
        "Ne moraš. Možeš zakazati kao gost, ali nalog ti omogućava lakši pregled, izmenu i otkazivanje termina.",
      domain: "faq",
      action: "answer_question",
      confidence: 0.98,
      shouldHandoff: false,
      targetAgent: "maria",
      reason: "faq_guest_booking",
    });
  }

  if (
    /\b(kako|sta|sto|koliko)\b/.test(normalized) &&
    /\b(otkaz|otkazem|otkazivanje)\b/.test(normalized)
  ) {
    return buildMariaContract({
      kind: "faq_answer",
      message:
        "Termin možeš otkazati iz pregleda svojih termina kada si prijavljena, a ako ti treba pomoć samo mi reci koji termin želiš da otkažeš.",
      domain: "faq",
      action: "answer_question",
      confidence: 0.96,
      shouldHandoff: false,
      targetAgent: "maria",
      reason: "faq_cancel_how",
    });
  }

  if (
    /\b(kako|sta|sto)\b/.test(normalized) &&
    /\b(promen|pomeri|izmen|reschedule)\b/.test(normalized)
  ) {
    return buildMariaContract({
      kind: "faq_answer",
      message:
        "Promenu termina možeš pokrenuti iz svojih termina, a Claudia će ponuditi najbliže slobodne alternative.",
      domain: "faq",
      action: "answer_question",
      confidence: 0.96,
      shouldHandoff: false,
      targetAgent: "maria",
      reason: "faq_reschedule_how",
    });
  }

  if (
    /\b(sta|sto|kako|ako)\b/.test(normalized) &&
    /\b(zauzet|zauzme|konflikt|nema vise)\b/.test(normalized) &&
    /\b(termin|slot)\b/.test(normalized)
  ) {
    return buildMariaContract({
      kind: "faq_answer",
      message:
        "Ako se termin zauzme pre potvrde, Claudia će odmah ponuditi najbliže slobodne alternative.",
      domain: "faq",
      action: "answer_question",
      confidence: 0.97,
      shouldHandoff: false,
      targetAgent: "maria",
      reason: "faq_slot_taken",
    });
  }

  if (
    /\b(kako|sta|objasni)\b/.test(normalized) &&
    /\b(obavesti|notifik|lista cekanja|waiting list|notify)\b/.test(normalized)
  ) {
    return buildMariaContract({
      kind: "faq_answer",
      message:
        "Možeš ostaviti zahtev za obaveštenje, pa ćemo te javiti kada se pojavi slobodan termin koji odgovara tvom izboru.",
      domain: "faq",
      action: "answer_question",
      confidence: 0.95,
      shouldHandoff: false,
      targetAgent: "maria",
      reason: "faq_notify_me",
    });
  }

  if (
    /\b(kako|sta|kada|da li)\b/.test(normalized) &&
    /\b(potvrd|odobren|odobrav|confirm)\b/.test(normalized) &&
    /\b(termin|rezerv)\b/.test(normalized)
  ) {
    return buildMariaContract({
      kind: "faq_answer",
      message:
        "Posle slanja zahteva salon potvrđuje termin, a status možeš pratiti kroz svoje termine ako si prijavljena.",
      domain: "faq",
      action: "answer_question",
      confidence: 0.94,
      shouldHandoff: false,
      targetAgent: "maria",
      reason: "faq_confirmations",
    });
  }

  return null;
}

const CONTACT_FLOW_STATES: AiBookingState[] = [
  "awaiting_confirmation",
  "collecting_contact",
  "ready_to_book",
];

function isAuthIntent(text: string): boolean {
  const normalized = text.toLowerCase();
  return /\b(login|prijavi|prijavim|uloguj|registruj|registracija|nalog|zaboravio|lozink)\b/.test(
    normalized,
  );
}

function isAppointmentsIntent(text: string): boolean {
  const normalized = text.toLowerCase();
  return /\b(moji termini|moje termine|moje rezervacije|šta sam zakazala|sta sam zakazala|zakazano|rezervacije|status termina)\b/.test(
    normalized,
  );
}

function getAppointmentManagementIntent(
  text: string,
): "cancel_appointment" | "update_appointment" | null {
  const normalized = text.toLowerCase();
  if (/\b(otkaži|otkazi|otkazem|otkažem|otkazivanje|cancel)\b/.test(normalized)) {
    return "cancel_appointment";
  }
  if (/\b(promeni|promenim|pomeri|pomerim|izmeni|izmenim|reschedule)\b/.test(normalized)) {
    return "update_appointment";
  }
  return null;
}

function isPricesIntent(text: string): boolean {
  const normalized = text.toLowerCase();
  return /\b(cenovnik|cene|cena|koliko košta|koliko kosta|price list)\b/.test(normalized);
}

function isNotifyMeIntent(text: string): boolean {
  const normalized = normalizeForIntent(text);
  return /\b(obavesti me|javi mi|notify me|lista cekanja|kad bude slobod|kada bude slobod)\b/.test(
    normalized,
  );
}

function isBookingHelpIntent(text: string): boolean {
  const normalized = text.toLowerCase();
  return /\b(kako mogu da zakažem|kako mogu da zakazem|kako da zakažem|kako da zakazem|kako zakazati)\b/.test(
    normalized,
  );
}

function isAvailabilitySearchIntent(input: {
  latestUserText: string;
  intent: StructuredBookingIntent;
  detectedCityQuestion: boolean;
}): boolean {
  const normalized = input.latestUserText.toLowerCase();
  return Boolean(
    /termin|slobod|zakaz|rezervis|appointment|booking/.test(normalized),
  );
}

function isSalonExistenceQuestion(text: string): boolean {
  const normalized = normalizeForIntent(text);
  const asksForSalon = /\b(postoji|imate|ima li|da li ima|da li postoji)\b/.test(normalized) &&
    /\b(salon|salona|saloni)\b/.test(normalized);
  const asksForServiceSalon = /\b(salon|salona|saloni)\b/.test(normalized) &&
    /\b(za|u)\b/.test(normalized);
  const asksForBooking = /\b(termin|slobod|zakaz|rezervis|appointment|booking)\b/.test(normalized);

  return (asksForSalon || asksForServiceSalon) && !asksForBooking;
}

function isBookingRequestText(text: string): boolean {
  return /\b(termin|slobod|zakaz|rezervis|appointment|booking)\b/.test(
    normalizeForIntent(text),
  );
}

function isServiceAvailabilityInfoQuestion(text: string): boolean {
  const normalized = normalizeForIntent(text);
  const asksForAvailability =
    /\b(interesuje me|ima li|da li ima|da li postoji|postoji|imate|radite|u kojim gradovima|koji gradovi|daj.*gradove|dajte.*gradove|gradove u kojima)\b/.test(normalized);
  const mentionsService =
    /\b(maderoterap\w*|masaz\w*|masaž\w*|tretman\w*|fenir\w*|sisanj\w*|šišanj\w*|nokti|nails|smink\w*|šmink\w*|makeup|trepav\w*|lashes|depil\w*)\b/.test(normalized);

  return asksForAvailability && mentionsService && !isBookingRequestText(text);
}

function isServiceCityListQuestion(text: string): boolean {
  const normalized = normalizeForIntent(text);
  return /\b(u kojim gradovima|koji gradovi|daj.*gradove|dajte.*gradove|gradove u kojima|gde imate|gdje imate)\b/.test(normalized) &&
    /\b(maderoterap\w*|masaz\w*|masaž\w*|tretman\w*|fenir\w*|sisanj\w*|šišanj\w*|nokti|nails|smink\w*|šmink\w*|makeup|trepav\w*|lashes|depil\w*)\b/.test(normalized) &&
    !isBookingRequestText(text);
}

function isServiceCityListFollowUp(text: string): boolean {
  return /\b(moze|može|proveri|proverite|najbliz|najbliž|gradove|gradovi)\b/.test(
    normalizeForIntent(text),
  );
}

function isNearestSalonQuestion(text: string): boolean {
  const normalized = normalizeForIntent(text);
  return /\b(najbliz|najbliž|blizu|najblizi|najbliži)\b/.test(normalized) &&
    /\b(salon|salona|saloni)\b/.test(normalized) &&
    !isBookingRequestText(text);
}

function isNearestSalonCityFollowUp(params: {
  latestUserText: string;
  previousUserText: string;
  city?: string;
}): boolean {
  return (
    Boolean(params.city) &&
    isNearestSalonQuestion(params.previousUserText) &&
    !isBookingRequestText(params.latestUserText)
  );
}

function sameCityName(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return normalizeForIntent(a) === normalizeForIntent(b);
}

function buildSalonExistenceMessage(input: {
  city?: string;
  service?: string;
  platform: Awaited<ReturnType<typeof fetchPlatformKnowledge>>;
}): string {
  const city = input.city;
  const salons = input.platform.raw?.salons ?? [];
  const service = input.service?.trim();
  const matchingCitySalons = city
    ? salons.filter((salon) => sameCityName(salon.city, city))
    : [];

  if (city && matchingCitySalons.length === 0) {
    return service
      ? `Trenutno nemamo salon za ${service} u ${city}. Mogu da proverim najbliže gradove ako želite.`
      : `Trenutno nemamo salon u ${city}. Mogu da proverim najbliže gradove ako želite.`;
  }

  if (city && matchingCitySalons.length > 0) {
    const names = matchingCitySalons.map((salon) => salon.name).filter(Boolean).slice(0, 3);
    const servicePart = service ? ` za ${service}` : "";
    return `Da, imamo ${matchingCitySalons.length === 1 ? "salon" : "salone"}${servicePart} u ${city}: ${names.join(", ")}.`;
  }

  return "Mogu da proverim, samo mi napišite grad koji vas zanima.";
}

function servicesBySalonFromPlatform(
  services: PlatformService[],
): Record<string, PlatformService[]> {
  const grouped: Record<string, PlatformService[]> = {};
  for (const service of services) {
    const salonId =
      typeof service.salonId === "string"
        ? service.salonId
        : typeof service._salonId === "string"
          ? service._salonId
          : "";
    if (!salonId) continue;
    grouped[salonId] = [...(grouped[salonId] ?? []), service];
  }
  return grouped;
}

function buildServiceAvailabilityInfoMessage(input: {
  city?: string;
  service?: string;
  platform: Awaited<ReturnType<typeof fetchPlatformKnowledge>>;
}): string {
  const city = input.city;
  const service = input.service?.trim();
  if (!service) return "Mogu da proverim, samo mi napišite koja usluga vas zanima.";
  if (!city) return `Mogu da proverim ${service}, samo mi napišite grad koji vas zanima.`;

  const salons = input.platform.raw?.salons ?? [];
  const services = input.platform.raw?.services ?? [];
  const resolved = resolveSalonsForService({
    serviceQuery: service,
    city,
    semanticMemory: input.platform.semanticMemory,
    salons,
    servicesBySalon: servicesBySalonFromPlatform(services),
  });

  if (resolved.salons.length === 0) {
    return `Trenutno nemamo salon za ${service} u ${city}. Mogu da proverim najbliže gradove ako želite.`;
  }

  const names = resolved.salons.map((salon) => salon.salonName).slice(0, 3);
  const servicesPreview = [
    ...new Set(
      resolved.salons.flatMap((salon) =>
        salon.matchingServices.map((item) => item.serviceName),
      ),
    ),
  ].slice(0, 3);

  const serviceText = servicesPreview.length > 0
    ? ` Dostupno: ${servicesPreview.join(", ")}.`
    : "";

  return `Da, imamo ${service} u ${city}: ${names.join(", ")}.${serviceText}`;
}

function buildServiceCityListMessage(input: {
  service?: string;
  platform: Awaited<ReturnType<typeof fetchPlatformKnowledge>>;
}): string {
  const service = input.service?.trim();
  if (!service) return "Mogu da proverim, samo mi napišite koju uslugu tražite.";

  const salons = input.platform.raw?.salons ?? [];
  const services = input.platform.raw?.services ?? [];
  const resolved = resolveSalonsForService({
    serviceQuery: service,
    semanticMemory: input.platform.semanticMemory,
    salons,
    servicesBySalon: servicesBySalonFromPlatform(services),
  });
  const cities = [
    ...new Set(
      resolved.salons
        .map((salon) => salon.city)
        .filter((city): city is string => Boolean(city)),
    ),
  ].sort((a, b) => a.localeCompare(b, "sr"));

  if (cities.length === 0) {
    return `Trenutno nemamo salone za ${service} u dostupnim gradovima.`;
  }

  return cities.length === 1
    ? `${service} trenutno imamo u gradu: ${cities[0]}.`
    : `${service} trenutno imamo u ovim gradovima: ${cities.join(", ")}.`;
}

function buildNearestSalonInfoMessage(input: {
  city?: string;
  platform: Awaited<ReturnType<typeof fetchPlatformKnowledge>>;
}): string {
  const city = input.city;
  if (!city) {
    return "Molim vas, recite mi u kom gradu se nalazite da bih vam preporučila najbliži salon.";
  }

  const salons = input.platform.raw?.salons ?? [];
  const sameCitySalons = salons.filter((salon) => sameCityName(salon.city, city));
  if (sameCitySalons.length > 0) {
    const names = sameCitySalons.map((salon) => salon.name).filter(Boolean).slice(0, 3);
    return `U ${city} imamo ${sameCitySalons.length === 1 ? "salon" : "salone"}: ${names.join(", ")}.`;
  }

  const nearestCities = [
    ...new Set(
      salons
        .map((salon) => salon.city)
        .filter((salonCity): salonCity is string => Boolean(salonCity)),
    ),
  ]
    .sort((a, b) => cityProximityRank(a, city) - cityProximityRank(b, city))
    .slice(0, 2);

  if (nearestCities.length === 0) {
    return `Trenutno nemamo salone u ${city}.`;
  }

  return `U ${city} trenutno nemamo dostupne salone. Najbliži gradovi sa salonima su ${nearestCities.join(" i ")}. Ako želite, mogu da vam prikažem salone u jednom od tih gradova.`;
}

function isRecoveredCityRejection(text: string): boolean {
  const normalized = text.toLowerCase();
  return /ne odgovara|ne pase|ne paše|ne zelim|ne želim|predaleko|nije mi ok|ne mogu u/.test(normalized);
}

function formatSelectedSlot(slot: SearchResult): string {
  const price = slot.price ? ` Cena je ${slot.price.toLocaleString("sr-RS")} RSD.` : "";
  return `Može. Izabrali ste ${slot.serviceName} ${slot.dateLabel.toLowerCase()} u ${slot.timeLabel} u ${slot.salonName}, ${slot.city}.${price} Da li želite da potvrdimo termin?`;
}

function formatReadyToBook(slot: SearchResult, contact: AiBookingContact): string {
  const name = contact.name ? ` za ${contact.name}` : "";
  return `Super, imam sve podatke za termin: ${slot.serviceName} ${slot.dateLabel.toLowerCase()} u ${slot.timeLabel} u ${slot.salonName}, ${slot.city}${name}. Sada završavam zakazivanje.`;
}

export function buildMariaSystemPrompt(
  salonsText: string,
  servicesText: string,
  citiesText: string,
  categoriesText: string,
  userName: string,
  isAuthenticated: boolean,
  userCity: string,
  language: string,
  memoryContext = formatAgentMemoryForPrompt(
    buildAgentMemoryContext({ activeAgent: "maria" }),
  ),
): string {
  const currentDate = new Date().toLocaleDateString("sr-RS", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `
# IDENTITY

Ti si **Maria**, AI concierge Marysoll booking platforme.
Govoriš u ženskom rodu. Ton: kratak, jasan, prijatan i profesionalan, kao recepcionarka poznatog hotela sa 5 zvezdica.
Bez emojia. Bez dugih objašnjenja.

# CRITICAL RULE

Ti NISI booking agent. Ti si SAMO concierge i router.
Tvoj jedini cilj: prepoznaj intent → prosledi pravom agentu.

NIKADA ne vodiš booking razgovor.
NIKADA ne postavljaš više pitanja za booking flow.
Maksimalno JEDNA rečenica po odgovoru.

--------------------------------------------------
# DANAS JE
${currentDate}

# USER CONTEXT
- USER: ${userName || "Gost"}
- AUTHENTICATED: ${isAuthenticated}
- CITY: ${userCity || "nije definisan"}
- LANGUAGE: ${language || "sr"}

${memoryContext}

--------------------------------------------------
# KNOWLEDGE BASE

### SALONI
${salonsText}

### USLUGE
${servicesText}

### GRADOVI
${citiesText}

### KATEGORIJE
${categoriesText}

--------------------------------------------------
# FORMAT ODGOVORA — OBAVEZNO

Tvoj odgovor mora biti ISKLJUČIVO validan JSON objekat. Bez teksta van JSON-a.
Bez markdown blokova. Bez code fence. Bez objašnjenja.

## Canonical MariaContract šema:
{
  "kind": "faq_answer" | "intent" | "clarification" | "unknown",
  "message": "kratka rečenica korisniku",
  "intent": {
    "domain": "faq" | "booking" | "appointments" | "auth" | "prices" | "reviews" | "notify_me" | "cancel" | "reschedule" | "unknown",
    "action": "answer_question" | "search_slots" | "book_slot" | "view_appointments" | "cancel_appointment" | "reschedule_appointment" | "show_prices" | "login" | "register" | "create_notify_watch" | "clarify" | "none",
    "confidence": 0.0,
    "entities": {
      "city": "...",
      "requestedCity": "...",
      "service": "...",
      "serviceId": "...",
      "serviceName": "...",
      "category": "...",
      "subcategory": "...",
      "salonId": "...",
      "salonName": "...",
      "date": "YYYY-MM-DD",
      "dateMode": "tomorrow",
      "time": "HH:MM",
      "timeWindowStart": 15,
      "timeWindowEnd": null
    },
    "missingFields": []
  },
  "routing": {
    "shouldHandoff": true,
    "targetAgent": "maria" | "claudia" | "auth" | "none",
    "reason": "kratak razlog"
  }
}

## Pravila:
- FAQ / informativno pitanje → kind "faq_answer", domain "faq", action "answer_question", routing.shouldHandoff false, targetAgent "maria".
- Booking/search/cancel/reschedule/appointments/prices/notify_me → kind "intent"; shouldHandoff true kada je potreban specijalista.
- Auth/login/register → routing.targetAgent "auth".
- Unknown ili nejasno → kind "clarification" ili "unknown", action "clarify", shouldHandoff false.
- entities popuni samo poljima koja korisnik EKSPLICITNO pomene ili koja se pouzdano izvuku iz konteksta.
- Ako korisnik kaže "posle 15h", popuni "timeWindowStart":15 i "timeWindowEnd":null. Ne pretvaraj to samo u "time":"15:00".
- "message" je UVEK kratka rečenica (1 rečenica) na jeziku korisnika.
- "confidence" je broj od 0 do 1.

## Primeri

FAQ:
{"kind":"faq_answer","message":"Ne moraš. Možeš zakazati kao gost, ali nalog ti omogućava lakši pregled, izmenu i otkazivanje termina.","intent":{"domain":"faq","action":"answer_question","confidence":0.98,"entities":{},"missingFields":[]},"routing":{"shouldHandoff":false,"targetAgent":"maria","reason":"faq_guest_booking"}}

Booking/search:
{"kind":"intent","message":"Molim vas sačekajte, prebacujem vas na Claudiu za termine.","intent":{"domain":"booking","action":"search_slots","confidence":0.95,"entities":{"service":"šišanje","date":"2026-05-11"},"missingFields":[]},"routing":{"shouldHandoff":true,"targetAgent":"claudia","reason":"booking_search"}}

Appointments:
{"kind":"intent","message":"Molim vas sačekajte, Claudia će prikazati vaše termine.","intent":{"domain":"appointments","action":"view_appointments","confidence":0.95,"entities":{},"missingFields":[]},"routing":{"shouldHandoff":true,"targetAgent":"claudia","reason":"appointments_view"}}

--------------------------------------------------
# AGENT HANDOFF — KADA KORISTITI

## FAQ / INFORMACIONA PITANJA — PRIORITET #1
Ako korisnik pita kako nešto funkcioniše, odgovori direktno i NE radi handoff.
Primeri:
- "Kako mogu da zakažem termin?"
- "Da li moram da se registrujem da bih zakazala termin?"
- "Da li mogu kao gost da zakažem?"
- "Šta se desi ako je termin zauzet?"
- "Kako mogu da otkažem termin?"

## TERMINI
Prepoznaješ: "moji termini", "šta sam zakazala", "reservations", "zakazano", "mogu li da vidim moje termine", "da li mogu da vidim moje termine", "pogledaj moje termine", "da li mi je termin odobren", "status termina", "da li je termin potvrđen", "čekam potvrdu", "je li moj termin odobren"
→ domain "appointments", action "view_appointments", shouldHandoff true, targetAgent "claudia"

## BOOKING
Prepoznaješ jasnu nameru zakazivanja: "zakaži mi", "hoću termin za", "rezerviši", usluga + grad/datum/vreme, "sutra posle Xh", "hitno"
→ domain "booking", action "search_slots", shouldHandoff true, targetAgent "claudia"

## LOGIN / REGISTRACIJA
Prepoznaješ: "login", "prijavi me", "napravi nalog", "registracija", "uloguj", "zaboravio lozinku"
→ domain "auth", action "login" ili "register", shouldHandoff true, targetAgent "auth"

## CENOVNIK
Prepoznaješ: "cenovnik", "koliko košta", "cene", "price list", "šta košta"
→ domain "prices", action "show_prices", shouldHandoff true, targetAgent "claudia"

## UTISCI
Prepoznaješ: "utisci", "review", "komentar", "ocena"
→ domain "reviews", action "answer_question" ili "none", shouldHandoff true ako treba blok, targetAgent "claudia"

## OBAVESTI ME / LISTA ČEKANJA
Prepoznaješ: "obavesti me", "javi mi kad bude slobodno", "lista čekanja", "notify me"
→ domain "notify_me", action "create_notify_watch", shouldHandoff true, targetAgent "claudia"

--------------------------------------------------
# DIREKTNI ODGOVORI (answer)

Za opšta pitanja (radno vreme, lokacije, usluge):
Odgovori direktno iz knowledge base, 1 rečenica.
→ {"type":"answer","message":"...","targetAgent":"none"}

--------------------------------------------------
# MULTI LANGUAGE

Odgovaraj na jeziku korisnika (srpski / engleski / mešano).
Polje "message" uvek na jeziku korisnika.

--------------------------------------------------
# HARD RULES

- UVEK vraćaj validan JSON.
- NIKADA ne izmišljaj usluge, cene ili termine.
- NIKADA ne dodavaj tekst van JSON objekta.
`.trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      messages,
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
      messages: Pick<Message, "role" | "content">[];
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
    const conversationMessages = (messages ?? []).filter(
      (message): message is { role: "user" | "assistant"; content: string } =>
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string",
    );
    const latestUserText =
      [...conversationMessages].reverse().find((message) => message.role === "user")?.content ?? "";
    const aiBookingStateBefore = aiBookingState ?? "idle";

    const faqContract = detectDeterministicFaq(latestUserText);
    if (faqContract) {
      return responseFromContract(faqContract, {
        intent: lastIntent,
        selectedSlot,
        aiBookingState: aiBookingStateBefore,
        pendingContact,
        aiDebug: {
          rawExtractedIntent: undefined,
          mergedIntent: lastIntent,
          lastIntent,
          lastRecoveryState,
          selectedSlotExists: Boolean(selectedSlot),
          contactDetected: false,
          aiBookingStateBefore,
          aiBookingStateAfter: aiBookingStateBefore,
          skippedSearchReason: faqContract.routing.reason,
          handoffTriggered: false,
          targetAgent: "none",
          replyMode: "maria_contract_faq",
          mariaContract: faqContract,
        },
      });
    }

    const appointmentManagementIntent = getAppointmentManagementIntent(latestUserText);
    if (appointmentManagementIntent) {
      const contract = buildMariaContract({
        kind: "intent",
        message:
          appointmentManagementIntent === "cancel_appointment"
            ? "U redu, proveravam koji termin želite da otkažete."
            : "U redu, proveravam koji termin želite da promenite.",
        domain:
          appointmentManagementIntent === "cancel_appointment"
            ? "cancel"
            : "reschedule",
        action:
          appointmentManagementIntent === "cancel_appointment"
            ? "cancel_appointment"
            : "reschedule_appointment",
        confidence: 0.95,
        shouldHandoff: true,
        targetAgent: "claudia",
        reason: `${appointmentManagementIntent}_preflight`,
      });
      return responseFromContract(contract, {
        intent: lastIntent,
        selectedSlot,
        aiBookingState: aiBookingStateBefore,
        pendingContact,
        aiDebug: {
          rawExtractedIntent: undefined,
          mergedIntent: lastIntent,
          lastIntent,
          lastRecoveryState,
          selectedSlotExists: Boolean(selectedSlot),
          contactDetected: false,
          aiBookingStateBefore,
          aiBookingStateAfter: aiBookingStateBefore,
          skippedSearchReason: `${appointmentManagementIntent}_preflight`,
          handoffTriggered: true,
          targetAgent: "appointments",
          replyMode: appointmentManagementIntent,
          mariaContract: contract,
        },
      });
    }

    if (isAuthIntent(latestUserText)) {
      const contract = buildMariaContract({
        kind: "intent",
        message: selectedSlot
          ? "Otvaram prijavu da nastavimo zakazivanje tog termina."
          : "Otvaram prijavu.",
        domain: "auth",
        action: "login",
        confidence: 0.95,
        entities: selectedSlot ? { selectedSlot } : {},
        shouldHandoff: true,
        targetAgent: "auth",
        reason: "auth_intent_preflight",
      });
      return responseFromContract(contract, {
        intent: lastIntent,
        selectedSlot,
        aiBookingState: aiBookingStateBefore,
        pendingContact,
        aiDebug: {
          rawExtractedIntent: undefined,
          mergedIntent: lastIntent,
          lastIntent,
          lastRecoveryState,
          selectedSlotExists: Boolean(selectedSlot),
          contactDetected: false,
          aiBookingStateBefore,
          aiBookingStateAfter: aiBookingStateBefore,
          skippedSearchReason: "auth_intent_preflight",
          handoffTriggered: true,
          targetAgent: "auth",
          replyMode: "auth_handoff",
          mariaContract: contract,
        },
      });
    }

    if (isAppointmentsIntent(latestUserText)) {
      const contract = buildMariaContract({
        kind: "intent",
        message: "Molim vas sačekajte, Claudia će prikazati vaše termine.",
        domain: "appointments",
        action: "view_appointments",
        confidence: 0.95,
        shouldHandoff: true,
        targetAgent: "claudia",
        reason: "appointments_intent_preflight",
      });
      return responseFromContract(contract, {
        intent: lastIntent,
        selectedSlot,
        aiBookingState: aiBookingStateBefore,
        pendingContact,
        aiDebug: {
          rawExtractedIntent: undefined,
          mergedIntent: lastIntent,
          lastIntent,
          lastRecoveryState,
          selectedSlotExists: Boolean(selectedSlot),
          contactDetected: false,
          aiBookingStateBefore,
          aiBookingStateAfter: aiBookingStateBefore,
          skippedSearchReason: "appointments_intent_preflight",
          handoffTriggered: true,
          targetAgent: "appointments",
          replyMode: "appointments_handoff",
          mariaContract: contract,
        },
      });
    }

    if (isPricesIntent(latestUserText)) {
      const contract = buildMariaContract({
        kind: "intent",
        message: "Otvaram cenovnik.",
        domain: "prices",
        action: "show_prices",
        confidence: 0.94,
        shouldHandoff: true,
        targetAgent: "claudia",
        reason: "prices_intent_preflight",
      });
      return responseFromContract(contract, {
        intent: lastIntent,
        selectedSlot,
        aiBookingState: aiBookingStateBefore,
        pendingContact,
        aiDebug: {
          rawExtractedIntent: undefined,
          mergedIntent: lastIntent,
          lastIntent,
          lastRecoveryState,
          selectedSlotExists: Boolean(selectedSlot),
          contactDetected: false,
          aiBookingStateBefore,
          aiBookingStateAfter: aiBookingStateBefore,
          skippedSearchReason: "prices_intent_preflight",
          handoffTriggered: true,
          targetAgent: "prices",
          replyMode: "prices_handoff",
          mariaContract: contract,
        },
      });
    }

    if (isBookingHelpIntent(latestUserText)) {
      const contract = buildMariaContract({
        kind: "faq_answer",
        message:
          "Napiši koju uslugu želiš, grad i okvirno vreme, na primer: Feniranje u Novom Sadu posle 13h.",
        domain: "faq",
        action: "answer_question",
        confidence: 0.98,
        shouldHandoff: false,
        targetAgent: "maria",
        reason: "booking_help_intent_preflight",
      });
      return responseFromContract(contract, {
        intent: lastIntent,
        aiBookingState: aiBookingStateBefore,
        pendingContact,
        aiDebug: {
          rawExtractedIntent: undefined,
          mergedIntent: lastIntent,
          lastIntent,
          lastRecoveryState,
          selectedSlotExists: Boolean(selectedSlot),
          contactDetected: false,
          aiBookingStateBefore,
          aiBookingStateAfter: aiBookingStateBefore,
          skippedSearchReason: "booking_help_intent_preflight",
          handoffTriggered: false,
          targetAgent: "none",
          replyMode: "booking_help",
          mariaContract: contract,
        },
      });
    }

    const cityQuestion = detectCityAvailabilityQuestion(latestUserText);
    const rawExtractedIntent = extractBookingIntentFromConversation({
      messages: conversationMessages,
      currentCity: userCity || undefined,
    });
    const extractedIntent = mergeIntentWithConversationContext({
      latestUserText,
      rawExtractedIntent,
      lastIntent,
      lastRecoveryState,
      selectedSlot,
      aiBookingState,
    });
    const previousServiceIntent = (() => {
      const previousUsers = conversationMessages
        .filter((message) => message.role === "user")
        .slice(0, -1);
      return extractBookingIntentFromConversation({
        messages: previousUsers,
        currentCity: userCity || undefined,
      }).service;
    })();

    const contactInfo = detectContactInfo({ userMessage: latestUserText });

    const previousUserText =
      conversationMessages
        .filter((message) => message.role === "user")
        .slice(0, -1)
        .reverse()[0]?.content ?? "";
    const nearestSalonQuestion = isNearestSalonQuestion(latestUserText);
    const nearestSalonCityFollowUp = isNearestSalonCityFollowUp({
      latestUserText,
      previousUserText,
      city: cityQuestion.city ?? extractedIntent.city ?? extractedIntent.requestedCity,
    });
    const salonExistenceQuestion = isSalonExistenceQuestion(latestUserText);
    const serviceAvailabilityInfoQuestion =
      isServiceAvailabilityInfoQuestion(latestUserText);
    const serviceCityListQuestion =
      isServiceCityListQuestion(latestUserText);
    const serviceCityListFollowUp =
      !serviceCityListQuestion &&
      (isServiceAvailabilityInfoQuestion(previousUserText) ||
        isSalonExistenceQuestion(previousUserText) ||
        isServiceCityListQuestion(previousUserText)) &&
      isServiceCityListFollowUp(latestUserText) &&
      !isBookingRequestText(latestUserText);
    const serviceAvailabilityInfoFollowUp =
      !serviceAvailabilityInfoQuestion &&
      !serviceCityListFollowUp &&
      isServiceAvailabilityInfoQuestion(previousUserText) &&
      Boolean(cityQuestion.city ?? extractedIntent.city ?? extractedIntent.requestedCity) &&
      !isBookingRequestText(latestUserText);
    const salonExistenceFollowUp =
      !salonExistenceQuestion &&
      isSalonExistenceQuestion(previousUserText) &&
      Boolean(cityQuestion.city ?? extractedIntent.city ?? extractedIntent.requestedCity) &&
      !isBookingRequestText(latestUserText);

    if (nearestSalonQuestion || nearestSalonCityFollowUp) {
      const platform = await fetchPlatformKnowledge();
      const city =
        cityQuestion.city ??
        extractedIntent.city ??
        extractedIntent.requestedCity;
      const contract = buildMariaContract({
        kind: city ? "faq_answer" : "clarification",
        message: buildNearestSalonInfoMessage({
          city,
          platform,
        }),
        domain: "faq",
        action: city ? "answer_question" : "clarify",
        confidence: 0.96,
        entities: city ? { city } : {},
        missingFields: city ? [] : ["city"],
        shouldHandoff: false,
        targetAgent: "maria",
        reason: nearestSalonQuestion
          ? "nearest_salon_question"
          : "nearest_salon_city_followup",
      });
      return responseFromContract(contract, {
        intent: extractedIntent,
        selectedSlot,
        aiBookingState: aiBookingStateBefore,
        pendingContact,
        aiDebug: {
          rawExtractedIntent,
          mergedIntent: extractedIntent,
          lastIntent,
          lastRecoveryState,
          selectedSlotExists: Boolean(selectedSlot),
          contactDetected: contactInfo.hasContactInfo,
          aiBookingStateBefore,
          aiBookingStateAfter: aiBookingStateBefore,
          skippedSearchReason: "nearest_salon_info",
          handoffTriggered: false,
          targetAgent: "none",
          replyMode: "nearest_salon_info_answer",
          mariaContract: contract,
        },
      });
    }

    if (serviceCityListQuestion || serviceCityListFollowUp) {
      const platform = await fetchPlatformKnowledge();
      const service =
        rawExtractedIntent.service ??
        previousServiceIntent ??
        rawExtractedIntent.category ??
        extractedIntent.service ??
        extractedIntent.category;
      const contract = buildMariaContract({
        kind: "faq_answer",
        message: buildServiceCityListMessage({
          service,
          platform,
        }),
        domain: "faq",
        action: "answer_question",
        confidence: 0.95,
        entities: service ? { service } : {},
        shouldHandoff: false,
        targetAgent: "maria",
        reason: "service_city_list_question",
      });
      return responseFromContract(contract, {
        intent: { ...extractedIntent, city: undefined, requestedCity: undefined },
        selectedSlot,
        aiBookingState: aiBookingStateBefore,
        pendingContact,
        aiDebug: {
          rawExtractedIntent,
          mergedIntent: extractedIntent,
          lastIntent,
          lastRecoveryState,
          selectedSlotExists: Boolean(selectedSlot),
          contactDetected: contactInfo.hasContactInfo,
          aiBookingStateBefore,
          aiBookingStateAfter: aiBookingStateBefore,
          skippedSearchReason: "service_city_list_question",
          handoffTriggered: false,
          targetAgent: "none",
          replyMode: "service_city_list_answer",
          mariaContract: contract,
        },
      });
    }

    if (serviceAvailabilityInfoQuestion || serviceAvailabilityInfoFollowUp) {
      const platform = await fetchPlatformKnowledge();
      const city =
        cityQuestion.city ??
        extractedIntent.city ??
        extractedIntent.requestedCity;
      const service =
        extractedIntent.service ??
        previousServiceIntent ??
        extractedIntent.category;
      const contract = buildMariaContract({
        kind: "faq_answer",
        message: buildServiceAvailabilityInfoMessage({
          city,
          service,
          platform,
        }),
        domain: "faq",
        action: "answer_question",
        confidence: 0.95,
        entities: city || service ? { city, service } : {},
        shouldHandoff: false,
        targetAgent: "maria",
        reason: "service_availability_info_question",
      });
      return responseFromContract(contract, {
        intent: extractedIntent,
        selectedSlot,
        aiBookingState: aiBookingStateBefore,
        pendingContact,
        aiDebug: {
          rawExtractedIntent,
          mergedIntent: extractedIntent,
          lastIntent,
          lastRecoveryState,
          selectedSlotExists: Boolean(selectedSlot),
          contactDetected: contactInfo.hasContactInfo,
          aiBookingStateBefore,
          aiBookingStateAfter: aiBookingStateBefore,
          skippedSearchReason: "service_availability_info_question",
          handoffTriggered: false,
          targetAgent: "none",
          replyMode: "service_availability_info_answer",
          mariaContract: contract,
        },
      });
    }

    if (salonExistenceQuestion || salonExistenceFollowUp) {
      const platform = await fetchPlatformKnowledge();
      const city =
        cityQuestion.city ??
        extractedIntent.city ??
        extractedIntent.requestedCity;
      const service =
        extractedIntent.service ??
        previousServiceIntent ??
        extractedIntent.category;
      const contract = buildMariaContract({
        kind: "faq_answer",
        message: buildSalonExistenceMessage({
          city,
          service,
          platform,
        }),
        domain: "faq",
        action: "answer_question",
        confidence: 0.95,
        entities: city || service ? { city, service } : {},
        shouldHandoff: false,
        targetAgent: "maria",
        reason: "salon_existence_question",
      });
      return responseFromContract(contract, {
        intent: extractedIntent,
        selectedSlot,
        aiBookingState: aiBookingStateBefore,
        pendingContact,
        aiDebug: {
          rawExtractedIntent,
          mergedIntent: extractedIntent,
          lastIntent,
          lastRecoveryState,
          selectedSlotExists: Boolean(selectedSlot),
          contactDetected: contactInfo.hasContactInfo,
          aiBookingStateBefore,
          aiBookingStateAfter: aiBookingStateBefore,
          skippedSearchReason: "salon_existence_question",
          handoffTriggered: false,
          targetAgent: "none",
          replyMode: "salon_existence_answer",
          mariaContract: contract,
        },
      });
    }

    const confirmation = detectBookingConfirmation({
      userMessage: latestUserText,
      previousState: aiBookingState,
      selectedSlot,
    });
    if (confirmation.intent === "confirm_booking" && confirmation.selectedSlot) {
      const contract = buildMariaContract({
        kind: "intent",
        message: "Odlično. Samo mi pošaljite ime i telefon ili email za potvrdu termina.",
        domain: "booking",
        action: "book_slot",
        confidence: 1,
        entities: {
          ...entitiesFromIntent(extractedIntent),
          selectedSlot: confirmation.selectedSlot,
        },
        missingFields: ["contact"],
        shouldHandoff: false,
        targetAgent: "maria",
        reason: "awaiting_contact_after_confirmation",
      });
      return responseFromContract(contract, {
        selectedSlot: confirmation.selectedSlot,
        aiBookingState: "collecting_contact",
        intent: extractedIntent,
        aiDebug: {
          rawExtractedIntent,
          mergedIntent: extractedIntent,
          lastIntent,
          lastRecoveryState,
          selectedSlotExists: true,
          contactDetected: contactInfo.hasContactInfo,
          aiBookingStateBefore,
          aiBookingStateAfter: "collecting_contact",
          slotSelectionChecked: true,
          slotSelectionMatched: true,
          selectedSlotId: confirmation.selectedSlot.serviceId ?? confirmation.selectedSlot.serviceName,
          slotSelectionConfidence: 1,
          slotSelectionReason: "confirmation_after_slot_selected",
          skippedSearchBecauseSlotSelected: true,
          previousSlotsCount: lastOfferedSlots.length,
          skippedSearchReason: "awaiting_contact_after_confirmation",
          handoffTriggered: false,
          targetAgent: "none",
          aiBookingState: "collecting_contact",
          replyMode: "awaiting_contact",
          mariaContract: contract,
        },
      });
    }

    if (
      selectedSlot &&
      CONTACT_FLOW_STATES.includes(aiBookingStateBefore) &&
      contactInfo.hasContactInfo
    ) {
      const nextContact: AiBookingContact = {
        ...pendingContact,
        name: contactInfo.name ?? pendingContact?.name,
        phone: contactInfo.phone ?? pendingContact?.phone,
        email: contactInfo.email ?? pendingContact?.email,
      };
      const contract = buildMariaContract({
        kind: "intent",
        message: formatReadyToBook(selectedSlot, nextContact),
        domain: "booking",
        action: "book_slot",
        confidence: 1,
        entities: {
          ...entitiesFromIntent(extractedIntent),
          selectedSlot,
          contact: nextContact,
        },
        shouldHandoff: true,
        targetAgent: "claudia",
        reason: "contact_for_selected_slot",
      });
      return responseFromContract(contract, {
        intent: extractedIntent,
        selectedSlot,
        slots: [selectedSlot],
        aiBookingState: "ready_to_book",
        pendingContact: nextContact,
        legacyPayload: { aiBookingState: "ready_to_book" },
        aiDebug: {
          rawExtractedIntent,
          mergedIntent: extractedIntent,
          lastIntent,
          lastRecoveryState,
          selectedSlotExists: true,
          contactDetected: true,
          aiBookingStateBefore,
          aiBookingStateAfter: "ready_to_book",
          skippedSearchReason: "contact_for_selected_slot",
          handoffTriggered: true,
          targetAgent: "booking",
          replyMode: "handoff_to_booking",
          mariaContract: contract,
        },
      });
    }

    const slotSelection = detectSlotSelectionIntent({
      userMessage: latestUserText,
      previousSlots: lastOfferedSlots,
      previousIntent: extractedIntent,
    });
    if (slotSelection.isSlotSelection && slotSelection.selectedSlot) {
      const slotIntent = {
          ...extractedIntent,
          service: slotSelection.selectedSlot.serviceName,
          requestedCity: slotSelection.selectedSlot.city,
          city: slotSelection.selectedSlot.city,
        };
      const contract = buildMariaContract({
        kind: "intent",
        message: formatSelectedSlot(slotSelection.selectedSlot),
        domain: "booking",
        action: "book_slot",
        confidence: slotSelection.confidence,
        entities: {
          ...entitiesFromIntent(slotIntent),
          selectedSlot: slotSelection.selectedSlot,
        },
        missingFields: ["confirmation"],
        shouldHandoff: false,
        targetAgent: "maria",
        reason: "slot_selected",
      });
      return responseFromContract(contract, {
        intent: slotIntent,
        selectedSlot: slotSelection.selectedSlot,
        slots: [slotSelection.selectedSlot],
        suggestions: [
          { label: "Potvrdi termin", intent: "confirm_booking" },
          { label: "Izaberi drugi termin", intent: "choose_another_slot" },
          { label: "Prikaži još termina", intent: "show_more_slots" },
        ],
        aiBookingState: "awaiting_confirmation",
        pendingContact,
        aiDebug: {
          rawExtractedIntent,
          mergedIntent: extractedIntent,
          lastIntent,
          lastRecoveryState,
          selectedSlotExists: true,
          contactDetected: contactInfo.hasContactInfo,
          aiBookingStateBefore,
          aiBookingStateAfter: "awaiting_confirmation",
          slotSelectionChecked: true,
          slotSelectionMatched: true,
          selectedSlotId: slotSelection.selectedSlot.serviceId ?? slotSelection.selectedSlot.serviceName,
          slotSelectionConfidence: slotSelection.confidence,
          slotSelectionReason: slotSelection.matchReason,
          skippedSearchBecauseSlotSelected: true,
          previousSlotsCount: lastOfferedSlots.length,
          skippedSearchReason: "slot_selected",
          handoffTriggered: false,
          targetAgent: "none",
          aiBookingState: "awaiting_confirmation",
          replyMode: "slot_selected",
          mariaContract: contract,
        },
      });
    }

    if (isRecoveredCityRejection(latestUserText)) {
      const contract = buildMariaContract({
        kind: "clarification",
        message: "Razumem, nema problema. Da li želite da proverim drugi grad, drugo vreme ili neku drugu uslugu?",
        domain: "booking",
        action: "clarify",
        confidence: 0.9,
        entities: entitiesFromIntent(extractedIntent),
        missingFields: ["city_or_time_or_service"],
        shouldHandoff: false,
        targetAgent: "maria",
        reason: "recovered_city_rejected",
      });
      return responseFromContract(contract, {
        intent: extractedIntent,
        aiDebug: {
          rawExtractedIntent,
          mergedIntent: extractedIntent,
          lastIntent,
          lastRecoveryState,
          selectedSlotExists: Boolean(selectedSlot),
          contactDetected: contactInfo.hasContactInfo,
          aiBookingStateBefore,
          aiBookingStateAfter: aiBookingStateBefore,
          extractedIntent,
          previousServiceIntent,
          detectedCityQuestion: cityQuestion.detected,
          requestedCity: extractedIntent.requestedCity,
          effectiveCity: undefined,
          recoveryScenario: undefined,
          searchResultsCount: 0,
          slotSelectionChecked: true,
          slotSelectionMatched: false,
          slotSelectionConfidence: slotSelection.confidence,
          skippedSearchBecauseSlotSelected: false,
          previousSlotsCount: lastOfferedSlots.length,
          skippedSearchReason: "recovered_city_rejected",
          handoffTriggered: false,
          targetAgent: "none",
          replyMode: "recovered_city_rejected",
          mariaContract: contract,
        },
      });
    }

    if (isAuthIntent(latestUserText)) {
      const contract = buildMariaContract({
        kind: "intent",
        message: selectedSlot
          ? "Otvaram prijavu da nastavimo zakazivanje tog termina."
          : "Otvaram prijavu.",
        domain: "auth",
        action: "login",
        confidence: 0.94,
        entities: selectedSlot ? { selectedSlot } : {},
        shouldHandoff: true,
        targetAgent: "auth",
        reason: "auth_intent",
      });
      return responseFromContract(contract, {
        intent: extractedIntent,
        selectedSlot,
        aiBookingState: aiBookingStateBefore,
        pendingContact,
        aiDebug: {
          rawExtractedIntent,
          mergedIntent: extractedIntent,
          lastIntent,
          lastRecoveryState,
          selectedSlotExists: Boolean(selectedSlot),
          contactDetected: contactInfo.hasContactInfo,
          aiBookingStateBefore,
          aiBookingStateAfter: aiBookingStateBefore,
          skippedSearchReason: "auth_intent",
          handoffTriggered: true,
          targetAgent: "auth",
          replyMode: "deepseek_router",
          mariaContract: contract,
        },
      });
    }

    if (isNotifyMeIntent(latestUserText)) {
      const contract = buildMariaContract({
        kind: "intent",
        message: "Molim vas sačekajte, Claudia će pripremiti obaveštenje za slobodan termin.",
        domain: "notify_me",
        action: "create_notify_watch",
        confidence: 0.94,
        entities: entitiesFromIntent(extractedIntent),
        shouldHandoff: true,
        targetAgent: "claudia",
        reason: "notify_me_intent",
      });
      return responseFromContract(contract, {
        intent: extractedIntent,
        selectedSlot,
        aiBookingState: aiBookingStateBefore,
        pendingContact,
        aiDebug: {
          rawExtractedIntent,
          mergedIntent: extractedIntent,
          lastIntent,
          lastRecoveryState,
          selectedSlotExists: Boolean(selectedSlot),
          contactDetected: contactInfo.hasContactInfo,
          aiBookingStateBefore,
          aiBookingStateAfter: aiBookingStateBefore,
          skippedSearchReason: "notify_me_intent",
          handoffTriggered: true,
          targetAgent: "booking",
          replyMode: "notify_me_handoff",
          mariaContract: contract,
        },
      });
    }

    if (
      isAvailabilitySearchIntent({
        latestUserText,
        intent: extractedIntent,
        detectedCityQuestion: cityQuestion.detected,
      })
    ) {
      const handoffPayload = {
        intent: "booking",
        ...extractedIntent,
      };
      const aiDebug = {
        rawExtractedIntent,
        mergedIntent: extractedIntent,
        lastIntent,
        lastRecoveryState,
        selectedSlotExists: Boolean(selectedSlot),
        contactDetected: contactInfo.hasContactInfo,
        aiBookingStateBefore,
        aiBookingStateAfter: "searching",
        extractedIntent,
        previousServiceIntent,
        detectedCityQuestion: cityQuestion.detected,
        requestedCity: extractedIntent.requestedCity,
        timeWindowStart: extractedIntent.timeWindowStart,
        timeWindowEnd: extractedIntent.timeWindowEnd,
        slotSelectionChecked: true,
        slotSelectionMatched: false,
        slotSelectionConfidence: slotSelection.confidence,
        skippedSearchBecauseSlotSelected: false,
        previousSlotsCount: lastOfferedSlots.length,
        aiBookingState: "searching",
        skippedSearchReason: "booking_handoff_to_claudia",
        handoffTriggered: true,
        targetAgent: "booking",
        replyMode: "booking_handoff",
      };
      console.debug("[AI_INTENT]", {
        originalUserMessage: latestUserText,
        parsedPayload: handoffPayload,
        timeWindowStart: extractedIntent.timeWindowStart,
        timeWindowEnd: extractedIntent.timeWindowEnd,
      });
      console.debug("[AI_HANDOFF]", {
        originalUserMessage: latestUserText,
        targetAgent: "booking",
        parsedPayload: handoffPayload,
      });
      const contract = buildMariaContract({
        kind: "intent",
        message: "Molim vas sačekajte, prebacujem vas na Claudiu za termine.",
        domain: "booking",
        action: "search_slots",
        confidence: extractedIntent.service || extractedIntent.category ? 0.95 : 0.78,
        entities: entitiesFromIntent(extractedIntent),
        shouldHandoff: true,
        targetAgent: "claudia",
        reason: "booking_search",
      });
      return responseFromContract(contract, {
        intent: extractedIntent,
        aiBookingState: "searching",
        pendingContact,
        aiDebug: {
          ...aiDebug,
          mariaContract: contract,
        },
      });
    }

    const { salonsText, servicesText, citiesText, categoriesText, semanticMemory } =
      await fetchPlatformKnowledge();
    const lastAssistantMessage =
      [...conversationMessages]
        .reverse()
        .find((message) => message.role === "assistant")?.content;
    const lastRecoveryReason =
      lastRecoveryState && typeof lastRecoveryState === "object"
        ? String(
            (lastRecoveryState as unknown as Record<string, unknown>).reason ??
              (lastRecoveryState as unknown as Record<string, unknown>).scenario ??
              "",
          ) || undefined
        : undefined;
    const memoryContext = formatAgentMemoryForPrompt(
      buildAgentMemoryContext({
        activeAgent: "maria",
        bookingWorkflowStep: aiBookingStateBefore,
        bookingFlowCollected: extractedIntent as unknown as Record<string, unknown>,
        selectedSlot: selectedSlot as Record<string, unknown> | undefined,
        pendingBooking: pendingContact
          ? ({ contact: pendingContact } as Record<string, unknown>)
          : null,
        lastRecoveryReason,
        lastAssistantMessage,
        contactRequired: CONTACT_FLOW_STATES.includes(aiBookingStateBefore),
        semanticMemory,
      }),
    );

    const systemPrompt = buildMariaSystemPrompt(
      salonsText,
      servicesText,
      citiesText,
      categoriesText,
      userName,
      isAuthenticated,
      userCity,
      language,
      memoryContext,
    );

    const response = await withTimeout(fetch(
      "https://api.deepseek.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
          ],
          temperature: 0.3,
          max_tokens: 200,
          // Phase B SSE — proxy DeepSeek tokens to our SSE stream.
          stream: true,
          response_format: { type: "json_object" },
        }),
      },
    ), AI_TIMEOUT_MS, "deepseek");

    if (!response.ok) {
      // Error responses come back as plain JSON even when stream: true was
      // requested — DeepSeek only streams on success.
      const error = await response.json().catch(() => ({}));
      console.error("DeepSeek API error:", error);
      const contract = buildMariaContract({
        kind: "unknown",
        message: "Trenutno ne mogu da završim odgovor. Pokušajte ponovo za trenutak.",
        domain: "unknown",
        action: "clarify",
        confidence: 0,
        shouldHandoff: false,
        targetAgent: "maria",
        reason: "deepseek_error",
      });
      return responseFromContract(contract, {
        error: error.error?.message || "DeepSeek API error",
        aiDebug: {
          replyMode: "deepseek_error",
          errorReason: error.error?.message || "DeepSeek API error",
          mariaContract: contract,
        },
      });
    }

    // Proxy DeepSeek's SSE stream as our own. Tokens forward live; the final
    // metadata payload is assembled once the upstream stream completes and
    // the accumulated JSON content has been validated against the Maria
    // contract.
    return streamingResponseFromDeepSeek(response, (accumulated, usage, model) => {
      const rawContent = accumulated || "{}";
      const contract = parseMariaContract(rawContent);
      const legacy = mariaContractToLegacyResponse(contract);
      logMariaContract(contract);
      logLegacyAdapter(contract, legacy);
      return {
        ok: true,
        message: contract.message,
        intent: extractedIntent,
        choices: [{ message: { content: JSON.stringify(legacy) } }],
        usage,
        model,
        aiDebug: {
          extractedIntent,
          rawExtractedIntent,
          mergedIntent: extractedIntent,
          previousServiceIntent,
          detectedCityQuestion: cityQuestion.detected,
          lastIntent,
          lastRecoveryState,
          selectedSlotExists: Boolean(selectedSlot),
          contactDetected: contactInfo.hasContactInfo,
          aiBookingStateBefore,
          aiBookingStateAfter: aiBookingStateBefore,
          skippedSearchReason: undefined,
          handoffTriggered: legacy.type === "handoff",
          targetAgent: legacy.targetAgent,
          replyMode: "deepseek_router",
          mariaContract: contract,
        },
      };
    });
  } catch (error) {
    console.error("Error in deepseek-conversation API:", error);
    const contract = buildMariaContract({
      kind: "unknown",
      message: "Nešto je zapelo, ali nisam izgubila razgovor. Pokušajte ponovo.",
      domain: "unknown",
      action: "clarify",
      confidence: 0,
      shouldHandoff: false,
      targetAgent: "maria",
      reason: "route_error",
    });
    return responseFromContract(contract, {
      error: error instanceof Error ? error.message : "Internal server error",
      aiDebug: {
        replyMode: "route_error",
        errorReason: error instanceof Error ? error.message : String(error),
        mariaContract: contract,
      },
    });
  }
}

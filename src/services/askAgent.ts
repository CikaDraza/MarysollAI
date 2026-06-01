// src/services/askAgent.ts
import { ThreadItem } from "@/types/ai/chat-thread";
import OpenAI from "openai";
import { ClaudiaIntentSchema } from "@/lib/ai/schemas/claudia.schema";
import {
  claudiaContractToLegacyResponse,
  type ClaudiaContract,
} from "@/lib/ai/schemas/claudia-contract.schema";
import { fetchPlatformKnowledge } from "@/lib/ai/platform-knowledge";
import { platformClient } from "@/lib/api/platformClient";
import { bookingWorkflow } from "@/lib/ai/workflow/booking-workflow-store";
import { buildAgentMemoryContext } from "@/lib/ai/memory/buildAgentMemoryContext";
import { formatAgentMemoryForPrompt } from "@/lib/ai/memory/formatAgentMemoryForPrompt";
import { formatCommunicationRulesForPrompt } from "@/lib/ai/communication/formatCommunicationRulesForPrompt";
import { sanitizeVisibleAgentMessage } from "@/lib/ai/communication/agent-communication-rules";
import {
  formatSalonExistenceAnswer,
  formatNearestSalonAnswer,
  formatServiceAvailabilityAnswer,
  resolveCityServiceAvailability,
  validateAgentClaim,
} from "@/lib/ai/guards/agent-data-truth-guard";
import {
  describeBookingService,
  matchingCityItems,
  matchingSalonItems,
  resolveSalonsForService,
  type ResolvedServiceSalon,
} from "@/lib/ai/booking/booking-block-data";
import {
  bookingFlow,
  type CollectedBookingFields,
} from "@/lib/ai/booking-flow-state";
import type { AiBookingContact } from "@/types/aiBooking";
import { runBookingSearch } from "@/lib/search/runBookingSearch";
import { normalizeSemanticTerm } from "@/lib/search/serviceSemanticMap";
import type { StructuredBookingIntent } from "@/types/intent";
import type { SearchApiResponse, SearchResult } from "@/types/slots";
import {
  isActiveAppointment,
  isCancellableAppointment,
  sortAppointmentsByScheduledDesc,
  type AppointmentFilterInput,
} from "@/lib/appointments/appointmentFilters";
import { sliceFromCollected } from "@/lib/ai/slicePlatformKnowledge";

type AppointmentPayload = Record<string, unknown> & AppointmentFilterInput;

export interface ClaudiaDirectIntent {
  type:
    | "booking"
    | "prices"
    | "salon_info"
    | "service_info"
    | "appointments"
    | "auth"
    | "notify_me"
    | "follow_up"
    | "unknown";
  confidence: number;
  entities: {
    city?: string;
    service?: string;
    category?: string;
    salonName?: string;
    date?: string;
    dateMode?: string;
    time?: string;
    timeWindowStart?: number | null;
    timeWindowEnd?: number | null;
  };
}

let deepseekClient: OpenAI | null = null;

function getDeepseekClient(): OpenAI {
  deepseekClient ??= new OpenAI({
    baseURL: "https://api.deepseek.com/v1",
    apiKey: process.env.DEEPSEEK_API_KEY_SYSTEM!,
  });
  return deepseekClient;
}

// Phase 1.5 — Booking memory section.
// Generated server-side from the snapshot the client forwards. Tells Claudia
// which fields are already known so she doesn't re-ask, and which single field
// to ask for next.
function buildBookingMemorySection(
  collected: CollectedBookingFields | undefined,
): string {
  if (!collected || Object.keys(collected).length === 0) {
    return "";
  }
  const known: string[] = [];
  if (collected.city) known.push(`grad: ${collected.city}`);
  if (collected.service) known.push(`usluga: ${collected.service}`);
  if (collected.salonName) known.push(`salon: ${collected.salonName}`);
  if (collected.date) known.push(`datum: ${collected.date}`);
  if (collected.time) known.push(`vreme: ${collected.time}`);
  if (collected.timeWindowStart != null) {
    known.push(
      `vremenski prozor: posle ${collected.timeWindowStart}h${
        collected.timeWindowEnd != null ? ` do ${collected.timeWindowEnd}h` : ""
      }`,
    );
  }

  const required: Array<keyof CollectedBookingFields> = ["service", "city"];
  const missing = required.filter((k) => !collected[k]);
  const missingLabels = missing.map((k) =>
    k === "city" ? "grad" : k === "service" ? "usluga" : k,
  );

  return `
--------------------------------------------------
# BOOKING MEMORY (već prikupljeno od korisnika)

${known.length > 0 ? known.map((k) => `- ${k}`).join("\n") : "- (još uvek prazno)"}

## NEDOSTAJE
${missingLabels.length === 0 ? "Sve obavezno polje je prikupljeno — pređi na prikazivanje termina." : missingLabels.map((m) => `- ${m}`).join("\n")}

## PRAVILA PAMĆENJA
- NIKADA ne pitaj ponovo ono što je već prikupljeno gore.
- Pitaj SAMO za PRVO sledeće nedostajuće polje (jedna kratka rečenica).
- NIKADA ne postavljaj više pitanja u istom odgovoru. Loš primer: "Koji grad i usluga?". Dobar primer: "Za koji grad?".
- Ako su sve obavezne stavke poznate, idi na AppointmentCalendarBlock sa popunjenim metadata-jem.
`;
}

export function buildClaudiaSystemPrompt(
  salonsText: string,
  servicesText: string,
  citiesText: string,
  categoriesText: string,
  isAuthenticated: boolean,
  userName: string,
  memoryContext = formatAgentMemoryForPrompt(
    buildAgentMemoryContext({ activeAgent: "claudia" }),
  ),
): string {
  const currentDate = new Date().toLocaleDateString("sr-RS", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const tomorrow = new Date(Date.now() + 86_400_000)
    .toISOString()
    .split("T")[0];
  const dayAfter = new Date(Date.now() + 172_800_000)
    .toISOString()
    .split("T")[0];

  return `
# IDENTITY

Ti si **Claudia**, AI booking orchestrator za Marysoll Booking platformu.
Obraćaj se korisniku u ženskom rodu.
Ton: profesionalan, brz, jasan, moderan UX stil, kao recepcionarka poznatog hotela sa 5 zvezdica. Bez emojia.

Claudia je podrazumevani korisnički concierge za Marysoll booking app.
Ti pokrivaš booking FAQ, cenovnik, salone, gradove, usluge, registraciju, moje termine, otkazivanje, pomeranje, konflikt termina, NotifyMe i recovery.
Ne vraćaš korisnika Mariji za booking/data pitanja.

Tvoj jedini cilj:
1. Razumeti intent korisnika
2. Pronaći odgovarajući blok (usluga, salon, termin)
3. Voditi korisnika do potvrđene rezervacije

Ti ne vodis opšti razgovor. Ti vodiš booking workflow.

--------------------------------------------------
# OBAVEZAN FORMAT ODGOVORA

Vraćaš ISKLJUČIVO ovaj JSON objekat — bez markdowna, bez teksta van JSON-a:
{
  "messages": [{ "role": "assistant", "content": "Kratka poruka korisniku.", "attachToBlockType": "AppointmentCalendarBlock" }],
  "layout": [{ "type": "AppointmentCalendarBlock", "priority": 1, "metadata": { "service": "naziv usluge", "city": "naziv grada", "date": "YYYY-MM-DD", "time": "HH:MM" } }],
  "intent": { "city": "Grad", "category": "kategorija", "date": "YYYY-MM-DD" }
}

## STRUKTURA METADATA PO BLOKU

AppointmentCalendarBlock:
  metadata: {
    "service": "naziv usluge (string)",
    "city": "naziv grada (string)",
    "date": "YYYY-MM-DD — OBAVEZNO izvuci iz poruke (sutra, prekosutra...)",
    "time": "HH:MM — OBAVEZNO izvuci ako korisnik naveo vreme (npr. '11:00'), inače prazan string",
    "salonId": "ID salona iz SALONI sekcije ako je poznat, inače prazan string",
    "salonName": "naziv salona ako je poznat, inače prazan string"
  }

ServicePriceBlock:
  metadata: { "service": "string", "salonId": "id salona ako je poznat", "salonName": "naziv salona ako je poznat" }

CityListBlock:
  metadata: {
    "service": "naziv usluge",
    "category": "kategorija usluge",
    "cities": [ { "name": "Beograd" }, { "name": "Novi Sad" } ]
  }
  ⚠ Popuni "cities" iz GRADOVI sekcije. Svaki element MORA imati polje "name".

SalonListBlock:
  metadata: {
    "city": "naziv grada",
    "service": "naziv usluge",
    "category": "kategorija usluge",
    "salons": [ { "id": "id_iz_SALONI_sekcije", "name": "naziv salona" } ]
  }
  ⚠ Popuni "salons" iz SALONI sekcije, filtriraj po gradu. Svaki element MORA imati "id" i "name".

CalendarBlock:
  metadata: { "mode": "list" }

AuthBlock:
  metadata: { "mode": "login" }  -- vrednosti: login | register | forgot | reset

TestimonialBlock:
  metadata: {}

--------------------------------------------------
# DANAS JE
${currentDate}

# USER CONTEXT
- USERNAME: ${userName || "Gost"}
- AUTHENTICATED: ${isAuthenticated}

${memoryContext}

${formatCommunicationRulesForPrompt("claudia")}

--------------------------------------------------
# PLATFORM KNOWLEDGE

## SALONI
${salonsText}

## USLUGE
${servicesText}

## GRADOVI
${citiesText}

## KATEGORIJE
${categoriesText}

--------------------------------------------------
# DATE/TIME PARSING

- "sutra" = ${tomorrow}
- "prekosutra" = ${dayAfter}
- "večeras" = posle 18:00 danas
- "posle 14h" → timeWindowStart: 14
- "ujutru" → timeWindowStart: 8, timeWindowEnd: 12
- "popodne" → timeWindowStart: 12, timeWindowEnd: 17
- "što pre" / "hitno" = nearest available

--------------------------------------------------
# BOOKING LOGIC

Ti NE računaš slobodne slotove.
Ti NE proveravaš overlap termina.
Ti pariraš intent i biraš pravi blok sa tačnim metadata.
Blok sam učitava termine.

--------------------------------------------------
# SMART UX RULES

## ZAKAZIVANJE (booking)
Ako imaš uslugu ali nemaš grad → CityListBlock
Ako imaš grad i uslugu ali nemaš salon → SalonListBlock filtriran po gradu i usluzi/kategoriji
Ako imaš grad, uslugu i salon → AppointmentCalendarBlock
Ako nedostaje grad → CityListBlock sa dostupnim gradovima
Ako nedostaje usluga → postavi JEDNO pitanje
Gost može da gleda slotove. Login tek pri finalnoj potvrdi.

## MOJI TERMINI (appointments)
Kada korisnik pita "moji termini", "šta sam zakazala", "zakazano", "reservations", "moje rezervacije", "mogu li da vidim moje termine", "da li mogu da vidim moje termine", "pogledaj moje termine", "da li mi je termin odobren", "status termina", "da li je termin potvrđen", "čekam potvrdu", "je li moj termin odobren":
- Ako je PRIJAVLJEN → vrati CalendarBlock, metadata: { "mode": "list" }
  Poruka mora početi sa: "Pozdrav, izvolite vaše termine."
  Primer: {"messages":[{"role":"assistant","content":"Pozdrav, izvolite vaše termine.","attachToBlockType":"CalendarBlock"}],"layout":[{"type":"CalendarBlock","priority":1,"metadata":{"mode":"list"}}],"intent":{}}
- Ako je GOST → vrati AuthBlock, metadata: { "mode": "login" }
  Primer: {"messages":[{"role":"assistant","content":"Prijavi se da vidiš svoje termine.","attachToBlockType":"AuthBlock"}],"layout":[{"type":"AuthBlock","priority":1,"metadata":{"mode":"login"}}],"intent":{}}

## CENOVNIK FLOW

Kada korisnik traži cenovnik/cene/usluge:
1. Ako NEMA grad → CityListBlock (da izabere grad)
2. Ako IMA grad ali NEMA salon → SalonListBlock (da izabere salon)
3. Ako IMA grad i salon (poruka sadrži "[salonId:XXX]") → ServicePriceBlock sa metadata.salonId i metadata.salonName

⚠ Kad korisnik pošalje "Izabrao sam salon: Naziv [salonId:abc123]":
  - Izvuci salonId iz [salonId:...] dela poruke
  - Odgovori sa ServicePriceBlock, metadata: { "salonId": "abc123", "salonName": "Naziv", "service": "..." }
  - NE prikazuj AppointmentCalendarBlock niti LandingSearchBlock za cenovnik zahtev

--------------------------------------------------
# AUTH RULES

GOST: može pregledati slotove i cene. Ne može potvrditi rezervaciju.
PRIJAVLJEN (${userName}): može sve.
NE traži login za browsing.

--------------------------------------------------
# DOSTUPNI BLOKOVI

- AppointmentCalendarBlock: slobodni termini — zahteva i grad i uslugu
- CalendarBlock: moji zakazani termini (mode: list) — samo prijavljeni korisnici
- ServicePriceBlock: cenovnik usluga
- SalonListBlock: lista salona u gradu — metadata.salons popuni iz SALONI sekcije
- CityListBlock: izbor grada — metadata.cities popuni iz GRADOVI sekcije (niz objekata sa poljem "name")
- AuthBlock: prijava/registracija (mode: login|register|forgot|reset)
- TestimonialBlock: utisci klijenata

--------------------------------------------------
# NO RESULTS FLOW

Nikada ne završavaj sa "Nema termina."
Uvek predloži alternativu: drugi dan, drugi grad, druga usluga.

--------------------------------------------------
# OUTPUT

Vraćaš ISKLJUČIVO valid JSON prema response schema.
Bez markdown-a. Bez objašnjenja. Bez HTML-a.
  `.trim();
}

function streamJson(body: unknown): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(JSON.stringify(body)));
      controller.close();
    },
  });
}

function shouldLogClaudiaContract(): boolean {
  return process.env.NODE_ENV !== "production";
}

function logClaudiaContract(contract: ClaudiaContract): void {
  if (!shouldLogClaudiaContract()) return;
  console.debug("[CLAUDIA_CONTRACT]", {
    kind: contract.kind,
    workflow: contract.workflow,
    nextAction: contract.nextAction.type,
    intentType: contract.intent.type,
    entityKeys: Object.keys(contract.intent.entities),
    blockTypes: contract.ui.blocks.map((block) => block.type),
  });
}

function logClaudiaLegacyAdapter(
  contract: ClaudiaContract,
  legacy: ReturnType<typeof claudiaContractToLegacyResponse>,
): void {
  if (!shouldLogClaudiaContract()) return;
  console.debug("[CLAUDIA_LEGACY_ADAPTER]", {
    kind: contract.kind,
    messageCount: legacy.messages.length,
    layoutTypes: legacy.layout.map((block) => block.type),
    intentKeys: legacy.intent ? Object.keys(legacy.intent) : [],
  });
}

function streamClaudiaContract(contract: ClaudiaContract): ReadableStream {
  const legacy = claudiaContractToLegacyResponse(contract);
  logClaudiaContract(contract);
  logClaudiaLegacyAdapter(contract, legacy);
  return streamJson(legacy);
}

function makeClaudiaContract(input: {
  kind: ClaudiaContract["kind"];
  message: string;
  workflowDomain: ClaudiaContract["workflow"]["domain"];
  step: string;
  nextAction: ClaudiaContract["nextAction"]["type"];
  intentType?: string;
  blocks?: unknown[];
  entities?: Record<string, unknown>;
  status?: ClaudiaContract["workflow"]["status"];
  reason?: string;
  confidence?: number;
  missingFields?: string[];
}): ClaudiaContract {
  const firstBlock = input.blocks?.find((block) => Boolean(block)) as
    | { metadata?: Record<string, unknown> }
    | undefined;
  const firstSlot = Array.isArray(firstBlock?.metadata?.slots)
    ? (firstBlock.metadata.slots[0] as Record<string, unknown> | undefined)
    : undefined;
  const selectedSlot =
    input.entities?.selectedSlot &&
    typeof input.entities.selectedSlot === "object"
      ? (input.entities.selectedSlot as Record<string, unknown>)
      : firstSlot;
  const requestedCity =
    asString(input.entities?.requestedCity) ?? asString(input.entities?.city);
  const requestedService =
    asString(input.entities?.serviceName) ?? asString(input.entities?.service);
  const truth = validateAgentClaim({
    agent: "claudia",
    requestedCity,
    requestedService,
    requestedCategory: asString(input.entities?.category),
    slot: selectedSlot
      ? {
          city: asString(selectedSlot.city),
          salonId: asString(selectedSlot.salonId),
          salonName: asString(selectedSlot.salonName),
          serviceName: asString(selectedSlot.serviceName),
          startTime: asString(selectedSlot.startTime),
        }
      : undefined,
    salon:
      asString(input.entities?.salonName) || asString(input.entities?.salonId)
        ? {
            id: asString(input.entities?.salonId),
            name: asString(input.entities?.salonName),
            city: asString(input.entities?.salonCity),
          }
        : undefined,
    message: input.message,
  });
  if (!truth.valid) {
    console.debug("[AGENT_DATA_TRUTH_GUARD]", {
      agent: "claudia",
      reason: truth.reason,
      before: input.message,
      after: truth.correctedMessage,
    });
  }
  const message = sanitizeVisibleAgentMessage(
    truth.correctedMessage ?? input.message,
    "claudia",
  );
  return {
    kind: input.kind,
    message,
    workflow: {
      domain: input.workflowDomain,
      step: input.step,
      status: input.status ?? "ready",
    },
    nextAction: {
      type: input.nextAction,
      reason: input.reason,
    },
    ui: {
      blocks: (input.blocks ?? []) as ClaudiaContract["ui"]["blocks"],
      hideBlocks: [],
      showBlocks: [],
    },
    intent: {
      type: input.intentType,
      confidence: input.confidence ?? 1,
      entities: (input.entities ?? {}) as ClaudiaContract["intent"]["entities"],
      missingFields: input.missingFields ?? [],
    },
  };
}

function makeClarificationContract(input: {
  message: string;
  workflowDomain?: ClaudiaContract["workflow"]["domain"];
  step: string;
  intentType?: string;
  entities?: Record<string, unknown>;
  missingFields?: string[];
}): ClaudiaContract {
  return makeClaudiaContract({
    kind: "clarification",
    message: input.message,
    workflowDomain: input.workflowDomain ?? "booking",
    step: input.step,
    nextAction: "ASK_CLARIFICATION",
    intentType: input.intentType,
    entities: input.entities,
    status: "waiting_for_user",
    reason: input.step,
    confidence: 0.8,
    missingFields: input.missingFields,
  });
}

function makeAuthContract(input: {
  message: string;
  intentType: string;
  blocks: unknown[];
  step?: string;
}): ClaudiaContract {
  return makeClaudiaContract({
    kind: "auth",
    message: input.message,
    workflowDomain: "auth",
    step: input.step ?? "login",
    nextAction: "SHOW_AUTH",
    intentType: input.intentType,
    blocks: input.blocks,
    status: "waiting_for_user",
    reason: input.intentType,
  });
}

function makeAppointmentsContract(input: {
  message: string;
  intentType: string;
  blocks: unknown[];
  step?: string;
  entities?: Record<string, unknown>;
  status?: ClaudiaContract["workflow"]["status"];
}): ClaudiaContract {
  return makeClaudiaContract({
    kind: "appointments",
    message: input.message,
    workflowDomain: "appointments",
    step: input.step ?? input.intentType,
    nextAction: "SHOW_APPOINTMENTS",
    intentType: input.intentType,
    blocks: input.blocks,
    entities: input.entities,
    status: input.status,
    reason: input.intentType,
  });
}

function makeBookingResultContract(input: {
  message: string;
  intentType: string;
  blocks: unknown[];
  entities?: Record<string, unknown>;
  step?: string;
  nextAction?: ClaudiaContract["nextAction"]["type"];
  status?: ClaudiaContract["workflow"]["status"];
}): ClaudiaContract {
  return makeClaudiaContract({
    kind: "booking_result",
    message: input.message,
    workflowDomain: "booking",
    step: input.step ?? input.intentType,
    nextAction:
      input.nextAction ?? (input.blocks.length > 0 ? "SHOW_SLOTS" : "NONE"),
    intentType: input.intentType,
    blocks: input.blocks,
    entities: input.entities,
    status: input.status,
    reason: input.intentType,
  });
}

function makeRecoveryContract(input: {
  message: string;
  intentType: string;
  blocks: unknown[];
  entities?: Record<string, unknown>;
  step?: string;
  status?: ClaudiaContract["workflow"]["status"];
  nextAction?: ClaudiaContract["nextAction"]["type"];
}): ClaudiaContract {
  return makeClaudiaContract({
    kind: "recovery",
    message: input.message,
    workflowDomain: "recovery",
    step: input.step ?? input.intentType,
    nextAction:
      input.nextAction ??
      (input.blocks.length > 0 ? "SHOW_RECOVERY_ALTERNATIVES" : "NONE"),
    intentType: input.intentType,
    blocks: input.blocks,
    entities: input.entities,
    status: input.status,
    reason: input.step ?? input.intentType,
  });
}

function buildAppointmentBlock(input: {
  service?: string;
  category?: string;
  subcategory?: string;
  serviceId?: string;
  serviceName?: string;
  city?: string;
  date?: string;
  time?: string;
  timeWindowStart?: number | null;
  timeWindowEnd?: number | null;
  salonId?: string;
  salonName?: string;
  slots?: SearchResult[];
  mode?: string;
}) {
  return {
    type: "AppointmentCalendarBlock",
    priority: 1,
    metadata: {
      mode: input.mode,
      serviceId: input.serviceId ?? "",
      serviceName: input.serviceName ?? input.service ?? "",
      variantName: "",
      service: input.service ?? "",
      category: input.category ?? "",
      subcategory: input.subcategory ?? "",
      city: input.city ?? "",
      date: input.date ?? "",
      time: input.time ?? "",
      timeWindowStart: input.timeWindowStart,
      timeWindowEnd: input.timeWindowEnd,
      salonId: input.salonId ?? "",
      salonName: input.salonName ?? "",
      slots: input.slots,
      flowVersion: bookingFlow.get().flowVersion,
    },
  };
}

function buildAppointmentsListBlock(input: {
  intent?: string;
  appointmentListMode?: "all" | "can_cancel";
}) {
  return {
    type: "CalendarBlock",
    priority: 1,
    metadata: {
      mode: "list",
      appointmentListMode: input.appointmentListMode ?? "all",
      intent: input.intent ?? "appointments",
      serviceId: "",
      serviceName: "",
      variantName: "",
      flowVersion: bookingFlow.get().flowVersion,
    },
  };
}

async function fetchBookingSalons() {
  try {
    return await platformClient.getSalonProfiles();
  } catch (error) {
    console.warn("[CLAUDIA_BOOKING_BLOCK_DATA]", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

async function fetchServicesBySalon(
  salons: Awaited<ReturnType<typeof fetchBookingSalons>>,
) {
  const entries = await Promise.all(
    salons.map(async (salon) => {
      const id = String(salon._id ?? salon.id ?? "");
      if (!id) return null;
      if (Array.isArray(salon.services) && salon.services.length > 0) {
        return [id, salon.services] as const;
      }
      if (typeof platformClient.getSalonServices !== "function") {
        return [id, []] as const;
      }
      const services = await platformClient
        .getSalonServices(id)
        .catch(() => []);
      return [id, services] as const;
    }),
  );
  return Object.fromEntries(
    entries.filter(
      (
        entry,
      ): entry is readonly [
        string,
        Awaited<ReturnType<typeof platformClient.getSalonServices>>,
      ] => Boolean(entry),
    ),
  );
}

function buildCityListBlock(input: {
  service?: string;
  category?: string;
  cities: ReturnType<typeof matchingCityItems>;
}) {
  return {
    type: "CityListBlock",
    priority: 1,
    metadata: {
      serviceId: "",
      serviceName: input.service ?? "",
      variantName: "",
      service: input.service ?? "",
      category: input.category ?? "",
      cities: input.cities,
      flowVersion: bookingFlow.get().flowVersion,
    },
  };
}

function buildSalonListBlock(input: {
  city?: string;
  service?: string;
  category?: string;
  salons: ReturnType<typeof matchingSalonItems>;
}) {
  return {
    type: "SalonListBlock",
    priority: 1,
    metadata: {
      serviceId: "",
      serviceName: input.service ?? "",
      variantName: "",
      service: input.service ?? "",
      category: input.category ?? "",
      city: input.city ?? "",
      salons: input.salons,
      flowVersion: bookingFlow.get().flowVersion,
    },
  };
}

function buildSalonListBlockFromResolved(input: {
  city?: string;
  service?: string;
  category?: string;
  date?: string;
  time?: string;
  timeWindowStart?: number | null;
  timeWindowEnd?: number | null;
  salons: ResolvedServiceSalon[];
}) {
  return {
    type: "SalonListBlock",
    priority: 1,
    metadata: {
      serviceId: "",
      serviceName: input.service ?? "",
      variantName: "",
      service: input.service ?? "",
      category: input.category ?? "",
      city: input.city ?? "",
      date: input.date,
      time: input.time,
      timeWindowStart: input.timeWindowStart,
      timeWindowEnd: input.timeWindowEnd,
      salons: input.salons.map((salon) => ({
        id: salon.salonId,
        name: salon.salonName,
        address: salon.address,
        rating: salon.rating,
        reviewCount: salon.reviewCount,
        verified: salon.verified,
        matchingServices: salon.matchingServices,
      })),
      flowVersion: bookingFlow.get().flowVersion,
    },
  };
}

function inCity(city: string): string {
  if (city === "Bor") return "Boru";
  if (city === "Novi Sad") return "Novom Sadu";
  if (city === "Beograd") return "Beogradu";
  if (city === "Ruma") return "Rumi";
  if (city === "Leskovac") return "Leskovcu";
  if (city === "Sremska Mitrovica") return "Sremskoj Mitrovici";
  return city;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumberOrNull(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeDirectText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "dj")
    .replace(/\s+/g, " ")
    .trim();
}

function detectDirectCity(
  text: string,
  platform?: Awaited<ReturnType<typeof fetchPlatformKnowledge>>,
): string | undefined {
  const normalized = normalizeDirectText(text);
  const cityNames = [
    ...new Set([
      ...(platform?.citiesText
        .split(",")
        .map((city) => city.trim())
        .filter(Boolean) ?? []),
      "Beograd",
      "Novi Sad",
      "Bor",
      "Ruma",
      "Leskovac",
      "Niš",
    ]),
  ];
  return cityNames.find((city) => {
    const n = normalizeDirectText(city);
    const variants = [n];
    if (n.endsWith("ac")) variants.push(`${n.slice(0, -2)}cu`);
    if (n.endsWith("a")) variants.push(`${n.slice(0, -1)}i`);
    if (n === "novi sad") variants.push("novom sadu");
    return variants.some((variant) =>
      new RegExp(`(^|\\s)${variant}(?=$|\\s|[,.!?])`).test(normalized),
    );
  });
}

function detectDirectSalonName(
  text: string,
  platform?: Awaited<ReturnType<typeof fetchPlatformKnowledge>>,
): string | undefined {
  const normalized = normalizeDirectText(text);
  return platform?.raw?.salons.find((salon) => {
    const name = salon.name ? normalizeDirectText(salon.name) : "";
    if (!name) return false;
    return (
      normalized.includes(name) ||
      name
        .split(" ")
        .some((part) => part.length >= 4 && normalized.includes(part))
    );
  })?.name;
}

function detectDirectService(text: string): {
  service?: string;
  category?: string;
} {
  const normalized = normalizeDirectText(text);
  if (/\b(smink\w*|makeup)\b/.test(normalized))
    return { service: "šminkanje", category: "Šminka" };
  if (/\b(fenir\w*)\b/.test(normalized))
    return { service: "feniranje", category: "Kosa" };
  if (/\b(friz\w*|frizer\w*|sis\w*|šiš\w*|kosa)\b/.test(normalized))
    return { service: "frizerski salon", category: "Kosa" };
  if (/\b(masaz\w*|masaž\w*|maderoterap\w*)\b/.test(normalized))
    return { service: "masaža", category: "Masaža" };
  if (/\b(nokt\w*|manikir|pedikir)\b/.test(normalized))
    return { service: "nokti", category: "Nokti" };
  return {};
}

function detectDirectDate(
  text: string,
): Pick<ClaudiaDirectIntent["entities"], "date" | "dateMode"> {
  const normalized = normalizeDirectText(text);
  if (/\b(danas)\b/.test(normalized)) return { dateMode: "today" };
  if (/\b(sutra)\b/.test(normalized)) return { dateMode: "tomorrow" };
  if (/\b(nedelja|nedelju|nedjelja|nedjelju|vikend)\b/.test(normalized))
    return { dateMode: "weekend" };
  return {};
}

function detectDirectTime(
  text: string,
): Pick<
  ClaudiaDirectIntent["entities"],
  "time" | "timeWindowStart" | "timeWindowEnd"
> {
  const normalized = normalizeDirectText(text);
  const exact = normalized.match(
    /\bu\s*(\d{1,2})(?::(\d{2}))?\s*(?:h|sati|casova)?\b/,
  );
  if (exact) {
    return {
      time: `${exact[1].padStart(2, "0")}:${(exact[2] ?? "00").padStart(2, "0")}`,
    };
  }
  const after = normalized.match(/\b(posle|nakon|od)\s*(\d{1,2})/);
  if (after) return { timeWindowStart: Number(after[2]), timeWindowEnd: null };
  return {};
}

export function parseClaudiaDirectIntent(input: {
  text: string;
  platformKnowledge?: Awaited<ReturnType<typeof fetchPlatformKnowledge>>;
  collectedBookingFields?: CollectedBookingFields;
}): ClaudiaDirectIntent {
  const text = normalizeDirectText(input.text);
  const city = detectDirectCity(input.text, input.platformKnowledge);
  const salonName = detectDirectSalonName(input.text, input.platformKnowledge);
  const service = detectDirectService(input.text);
  const date = detectDirectDate(input.text);
  const time = detectDirectTime(input.text);
  const hasContext = Boolean(
    input.collectedBookingFields?.service ||
    input.collectedBookingFields?.city ||
    input.collectedBookingFields?.salonName,
  );

  if (
    /\b(moji termini|moje termine|moje rezervacije|zakazano|status termina)\b/.test(
      text,
    )
  ) {
    return { type: "appointments", confidence: 0.96, entities: {} };
  }
  if (/\b(login|prijavi|uloguj|registruj|nalog|lozink)\b/.test(text)) {
    return { type: "auth", confidence: 0.94, entities: {} };
  }
  if (
    /\b(obavesti me|javi mi|notify|lista cekanja|kad bude slobod)\b/.test(text)
  ) {
    return {
      type: "notify_me",
      confidence: 0.9,
      entities: { city, ...service, ...date, ...time },
    };
  }
  if (/\b(cenovnik|cene|cena|koliko kosta|koliko košta|vrste)\b/.test(text)) {
    return {
      type: "prices",
      confidence: 0.9,
      entities: { city, salonName, ...service, ...date, ...time },
    };
  }
  if (
    /\b(salon|salona|saloni|najbliz|najbliž|postoji|imate|ima li|da li ima)\b/.test(
      text,
    ) &&
    !date.dateMode &&
    !time.time
  ) {
    return {
      type: service.service ? "salon_info" : "salon_info",
      confidence: city || service.service ? 0.88 : 0.62,
      entities: { city, salonName, ...service },
    };
  }
  if (
    hasContext &&
    (/^(nedelja|nedelju|u \d{1,2}(?::\d{2})?|drugi salon|taj prvi|moze|može|ne taj)$/i.test(
      input.text.trim(),
    ) ||
      date.dateMode ||
      time.time)
  ) {
    return {
      type: "follow_up",
      confidence: 0.84,
      entities: { city, salonName, ...service, ...date, ...time },
    };
  }
  if (
    service.service ||
    salonName ||
    city ||
    (hasContext && (date.dateMode || time.time || time.timeWindowStart != null))
  ) {
    return {
      type: "booking",
      confidence: service.service || salonName ? 0.86 : 0.62,
      entities: { city, salonName, ...service, ...date, ...time },
    };
  }
  return { type: "unknown", confidence: 0.2, entities: {} };
}

function hasDateAndTimeIntent(intent: StructuredBookingIntent): boolean {
  return Boolean(
    intent.date &&
    (intent.time ||
      intent.timeWindowStart != null ||
      intent.timeWindowEnd != null),
  );
}

function buildIntentFromHandoff(
  handoffPayload: Record<string, unknown>,
  collected?: CollectedBookingFields,
): StructuredBookingIntent {
  const city =
    asString(handoffPayload.city) ??
    asString(handoffPayload.requestedCity) ??
    collected?.city;
  const service =
    asString(handoffPayload.service) ??
    asString(handoffPayload.serviceName) ??
    collected?.service ??
    collected?.serviceName;
  const payloadTimeWindowStart = asNumberOrNull(handoffPayload.timeWindowStart);
  const payloadTimeWindowEnd = asNumberOrNull(handoffPayload.timeWindowEnd);
  const timeWindowStart =
    payloadTimeWindowStart !== undefined
      ? payloadTimeWindowStart
      : collected?.timeWindowStart;
  const timeWindowEnd =
    payloadTimeWindowEnd !== undefined
      ? payloadTimeWindowEnd
      : collected?.timeWindowEnd;

  return {
    city,
    requestedCity: asString(handoffPayload.requestedCity) ?? city,
    service,
    serviceId: asString(handoffPayload.serviceId) ?? collected?.serviceId,
    serviceName: asString(handoffPayload.serviceName) ?? service,
    category: asString(handoffPayload.category) ?? collected?.category,
    subcategory: asString(handoffPayload.subcategory) ?? collected?.subcategory,
    salonId: asString(handoffPayload.salonId) ?? collected?.salonId,
    salonName: asString(handoffPayload.salonName) ?? collected?.salonName,
    date: asString(handoffPayload.date) ?? collected?.date,
    dateMode: asString(
      handoffPayload.dateMode,
    ) as StructuredBookingIntent["dateMode"],
    time: asString(handoffPayload.time) ?? collected?.time,
    timeWindowStart,
    timeWindowEnd,
    earliestTime:
      timeWindowStart != null
        ? `${String(timeWindowStart).padStart(2, "0")}:00`
        : asString(handoffPayload.earliestTime),
    latestTime: asString(handoffPayload.latestTime),
    queryType: asString(
      handoffPayload.queryType,
    ) as StructuredBookingIntent["queryType"],
  };
}

function slotStartMinutes(slot: SearchResult): number {
  const labelMatch = slot.timeLabel?.match(/^(\d{1,2}):(\d{2})/);
  if (labelMatch) {
    const hour = Number(labelMatch[1]);
    const minute = Number(labelMatch[2]);
    if (Number.isFinite(hour) && Number.isFinite(minute)) {
      return hour * 60 + minute;
    }
  }
  const isoHour = Number(slot.startTime?.slice(11, 13));
  const isoMinute = Number(slot.startTime?.slice(14, 16));
  if (Number.isFinite(isoHour) && Number.isFinite(isoMinute)) {
    return isoHour * 60 + isoMinute;
  }
  return 0;
}

function normalizeTimeLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseTimeLabelToMinutes(time: string): number | null {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function parseExactTimeCorrection(input: string): string | null {
  const normalized = input.toLowerCase();
  const match = normalized.match(
    /\b(?:u|at)\s*(\d{1,2})(?::(\d{2}))?\s*(h|časova|sati|am|pm)?\b/,
  );
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const suffix = match[3];
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return normalizeTimeLabel(hour * 60 + minute);
}

function hasCompleteActiveBooking(
  collected?: CollectedBookingFields,
): collected is CollectedBookingFields & {
  service: string;
  city: string;
  date: string;
} {
  return Boolean(
    (collected?.service || collected?.serviceId || collected?.serviceName) &&
    collected.city &&
    collected.date &&
    (collected.salonId || collected.salonName),
  );
}

function isBookingSelectionUpdate(
  input: string,
  collected?: CollectedBookingFields,
): boolean {
  if (!hasCompleteActiveBooking(collected)) return false;
  return Boolean(parseExactTimeCorrection(input));
}

function isInclusiveStartRequest(
  input: string,
  timeWindowStart?: number | null,
): boolean {
  if (timeWindowStart == null) return false;
  const hour = String(timeWindowStart);
  return new RegExp(
    `\\b(?:od|from)\\s*${hour}(?::00)?\\s*(?:h|časova|sati)?\\b`,
    "i",
  ).test(input);
}

function isStaleSelectionHandoff(
  handoffPayload?: Record<string, unknown>,
): boolean {
  const intent = asString(handoffPayload?.intent);
  if (intent !== "select_city" && intent !== "select_salon") return false;
  const flowVersion = asNumberOrNull(handoffPayload?.flowVersion);
  return (
    typeof flowVersion === "number" &&
    flowVersion < bookingFlow.get().flowVersion
  );
}

function isSalonCityExistenceFollowUp(input: string): boolean {
  const normalized = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return (
    /\b(da li|jel|je l|postoji|ima li)\b/.test(normalized) &&
    /\b(taj salon|salon)\b/.test(normalized) &&
    /\b(ruma|rumi|beograd|beogradu|novi sad|novom sadu|bor|boru|leskovac|leskovcu)\b/.test(
      normalized,
    )
  );
}

function extractAskedCity(input: string): string | undefined {
  const normalized = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/\b(ruma|rumi)\b/.test(normalized)) return "Ruma";
  if (/\b(beograd|beogradu)\b/.test(normalized)) return "Beograd";
  if (/\b(novi sad|novom sadu)\b/.test(normalized)) return "Novi Sad";
  if (/\b(bor|boru)\b/.test(normalized)) return "Bor";
  if (/\b(leskovac|leskovcu)\b/.test(normalized)) return "Leskovac";
  return undefined;
}

export function filterSearchResultByStartHour(
  searchResult: SearchApiResponse,
  timeWindowStart?: number | null,
  options: { inclusive?: boolean } = {},
): SearchApiResponse {
  if (timeWindowStart == null) return searchResult;
  const startMinutes = timeWindowStart * 60;
  const keep = (slot: SearchResult) =>
    options.inclusive
      ? slotStartMinutes(slot) >= startMinutes
      : slotStartMinutes(slot) > startMinutes;
  const results = searchResult.results.filter(keep);
  const slotsByCity = searchResult.slotsByCity
    .map((group) => ({ ...group, slots: group.slots.filter(keep) }))
    .filter((group) => group.slots.length > 0);
  return {
    ...searchResult,
    results,
    slotsByCity,
    bestSlot: results[0] ?? null,
  };
}

function filterSearchResultByStartMinutes(
  searchResult: SearchApiResponse,
  startMinutes: number,
  options: { inclusive?: boolean } = {},
): SearchApiResponse {
  const keep = (slot: SearchResult) =>
    options.inclusive
      ? slotStartMinutes(slot) >= startMinutes
      : slotStartMinutes(slot) > startMinutes;
  const results = searchResult.results.filter(keep);
  const slotsByCity = searchResult.slotsByCity
    .map((group) => ({ ...group, slots: group.slots.filter(keep) }))
    .filter((group) => group.slots.length > 0);
  return {
    ...searchResult,
    results,
    slotsByCity,
    bestSlot: results[0] ?? null,
  };
}

function filterSearchResultByExactTime(
  searchResult: SearchApiResponse,
  time: string,
): SearchApiResponse {
  const [hour, minute] = time.split(":").map(Number);
  const targetMinutes = hour * 60 + minute;
  const keep = (slot: SearchResult) => slotStartMinutes(slot) === targetMinutes;
  const results = searchResult.results.filter(keep);
  const slotsByCity = searchResult.slotsByCity
    .map((group) => ({ ...group, slots: group.slots.filter(keep) }))
    .filter((group) => group.slots.length > 0);
  return {
    ...searchResult,
    results,
    slotsByCity,
    bestSlot: results[0] ?? null,
  };
}

function inferRequestedDurationMinutes(
  searchResult: SearchApiResponse,
  intent: StructuredBookingIntent,
): number | null {
  const normalizedService = normalizeSemanticTerm(
    intent.serviceName ?? intent.service ?? "",
  );
  for (const slot of searchResult.results) {
    const sameServiceId =
      intent.serviceId && slot.serviceId === intent.serviceId;
    const sameServiceName =
      normalizedService &&
      normalizeSemanticTerm(slot.serviceName ?? "") === normalizedService;
    if (
      (sameServiceId || sameServiceName) &&
      typeof slot.serviceDuration === "number"
    ) {
      return slot.serviceDuration;
    }
  }
  const firstDuration = searchResult.results.find(
    (slot) => typeof slot.serviceDuration === "number",
  )?.serviceDuration;
  return typeof firstDuration === "number" ? firstDuration : null;
}

function bookingSearchMessage(input: {
  intent: StructuredBookingIntent;
  slots: SearchResult[];
  originalCount: number;
}): string {
  const service = input.intent.serviceName ?? input.intent.service;
  const city = input.intent.requestedCity ?? input.intent.city;
  const place = city ? ` u ${city}` : "";
  const after =
    input.intent.timeWindowStart != null
      ? ` posle ${input.intent.timeWindowStart}h`
      : "";
  if (input.slots.length > 0) {
    const cityMismatch =
      city && input.slots[0]?.city && input.slots[0].city !== city;
    if (cityMismatch) {
      return formatServiceAvailabilityAnswer({
        requestedCity: city,
        service,
        slots: input.slots,
      });
    }
    return `Pozdrav, imamo slobodne termine za ${service || "ovu uslugu"}${place}${after}.`;
  }
  if (input.intent.timeWindowStart != null && input.originalCount > 0) {
    return `Nema slobodnih termina${place} posle ${input.intent.timeWindowStart}h; mogu da proverim drugi dan ili širi vremenski okvir.`;
  }
  return `Trenutno nema slobodnih termina za ${service || "ovu uslugu"}${place}; mogu da proverim drugi dan ili drugu uslugu.`;
}

function readAppointmentsFromPayload(
  payload: Record<string, unknown> | undefined,
) {
  const raw = [
    ...(Array.isArray(payload?.appointments) ? payload.appointments : []),
    ...(payload?.appointment && typeof payload.appointment === "object"
      ? [payload.appointment]
      : []),
  ];
  return raw.filter((appointment): appointment is Record<string, unknown> =>
    Boolean(appointment && typeof appointment === "object"),
  );
}

function readActiveAppointments(payload: Record<string, unknown> | undefined) {
  return sortAppointmentsByScheduledDesc(
    readAppointmentsFromPayload(payload).filter(
      (appointment): appointment is AppointmentPayload =>
        isActiveAppointment(appointment as AppointmentFilterInput),
    ),
  );
}

function readCancellableAppointments(
  payload: Record<string, unknown> | undefined,
) {
  return sortAppointmentsByScheduledDesc(
    readAppointmentsFromPayload(payload).filter(
      (appointment): appointment is AppointmentPayload =>
        isCancellableAppointment(appointment as AppointmentFilterInput),
    ),
  );
}

function appointmentDateTimeText(appointment: Record<string, unknown>): string {
  const date = String(appointment.date ?? "");
  const time = String(appointment.time ?? "");
  return [date, time].filter(Boolean).join(" u ");
}

export async function askAgent(
  userInput: string,
  isAuthenticated: boolean,
  history: ThreadItem[],
  userName: string,
  isBlockInteraction = false,
  collectedBookingFields?: CollectedBookingFields,
  handoffPayload?: Record<string, unknown>,
) {
  // Guard: if Maria sent an intent, it must be a known ClaudiaIntent.
  // Unknown intent = Maria-side bug (typo, model drift) — refuse LLM fallback.
  if (handoffPayload?.intent !== undefined) {
    const intentParse = ClaudiaIntentSchema.safeParse(handoffPayload.intent);
    if (!intentParse.success) {
      console.error(
        "[askAgent] Unknown intent from Maria, refusing LLM fallback:",
        handoffPayload.intent,
      );
      return streamClaudiaContract(
        makeClarificationContract({
          message: "Ne razumem zahtev. Pokušajte ponovo.",
          workflowDomain: "unknown",
          step: "unknown_intent",
          intentType: "unknown",
        }),
      );
    }
  }

  const mergedBookingContext: CollectedBookingFields = {
    ...collectedBookingFields,
    city: asString(handoffPayload?.city) ?? collectedBookingFields?.city,
    service:
      asString(handoffPayload?.serviceName) ??
      asString(handoffPayload?.service) ??
      collectedBookingFields?.service,
    serviceId:
      asString(handoffPayload?.serviceId) ?? collectedBookingFields?.serviceId,
    serviceName:
      asString(handoffPayload?.serviceName) ??
      collectedBookingFields?.serviceName,
    category:
      asString(handoffPayload?.category) ?? collectedBookingFields?.category,
    subcategory:
      asString(handoffPayload?.subcategory) ??
      collectedBookingFields?.subcategory,
    salonId:
      asString(handoffPayload?.salonId) ?? collectedBookingFields?.salonId,
    salonName:
      asString(handoffPayload?.salonName) ?? collectedBookingFields?.salonName,
    date: asString(handoffPayload?.date) ?? collectedBookingFields?.date,
    time: asString(handoffPayload?.time) ?? collectedBookingFields?.time,
    timeWindowStart:
      asNumberOrNull(handoffPayload?.timeWindowStart) !== undefined
        ? asNumberOrNull(handoffPayload?.timeWindowStart)
        : collectedBookingFields?.timeWindowStart,
    timeWindowEnd:
      asNumberOrNull(handoffPayload?.timeWindowEnd) !== undefined
        ? asNumberOrNull(handoffPayload?.timeWindowEnd)
        : collectedBookingFields?.timeWindowEnd,
  };
  const exactTimeAtInput = parseExactTimeCorrection(userInput);
  const isFollowUpTimeCorrection = isBookingSelectionUpdate(
    userInput,
    mergedBookingContext,
  );
  console.debug("[CLAUDIA_MEMORY_AT_INPUT]", {
    userInput,
    collectedBookingFields,
    handoffPayload,
    workflowStep: bookingWorkflow.get().step,
    hasCity: Boolean(mergedBookingContext.city),
    hasSalon: Boolean(
      mergedBookingContext.salonId || mergedBookingContext.salonName,
    ),
    hasService: Boolean(
      mergedBookingContext.service ||
      mergedBookingContext.serviceId ||
      mergedBookingContext.serviceName,
    ),
    hasDate: Boolean(mergedBookingContext.date),
    hasExactTime: Boolean(exactTimeAtInput),
    isFollowUpTimeCorrection,
  });

  if (isStaleSelectionHandoff(handoffPayload)) {
    console.debug("[CLAUDIA_STALE_HANDOFF_IGNORED]", {
      intent: handoffPayload?.intent,
      handoffFlowVersion: handoffPayload?.flowVersion,
      currentFlowVersion: bookingFlow.get().flowVersion,
    });
    return streamClaudiaContract(
      makeClaudiaContract({
        kind: "unknown",
        message: "",
        workflowDomain: "booking",
        step: "stale_handoff_ignored",
        nextAction: "NONE",
        intentType: String(handoffPayload?.intent ?? "stale_handoff"),
        blocks: [],
        status: "ready",
        reason: "stale_handoff_ignored",
      }),
    );
  }

  if (
    !handoffPayload?.intent &&
    isSalonCityExistenceFollowUp(userInput) &&
    (collectedBookingFields?.salonName ||
      (collectedBookingFields as Record<string, unknown> | undefined)
        ?.selectedSlot)
  ) {
    console.debug("[CLAUDIA_PINGPONG_BLOCKED]", {
      message: userInput,
      reason: "salon_city_existence_followup",
    });
    const selectedSlot = (
      collectedBookingFields as Record<string, unknown> | undefined
    )?.selectedSlot as SearchResult | undefined;
    const requestedCity =
      extractAskedCity(userInput) ?? mergedBookingContext.city;
    const actualCity =
      selectedSlot?.city ?? asString(handoffPayload?.salonCity);
    const salonName =
      selectedSlot?.salonName ??
      mergedBookingContext.salonName ??
      asString(handoffPayload?.salonName);
    return streamClaudiaContract(
      makeClaudiaContract({
        kind: "booking_result",
        message: formatSalonExistenceAnswer({
          requestedCity,
          actualCity,
          salonName,
        }),
        workflowDomain: "booking",
        step: "salon_city_existence_answer",
        nextAction: "NONE",
        intentType: "booking",
        entities: {
          city: requestedCity,
          salonName,
        },
        status: "ready",
        reason: "pingpong_blocked_city_fact",
      }),
    );
  }

  if (!handoffPayload?.intent) {
    const salons = await fetchBookingSalons();
    const servicesBySalon = await fetchServicesBySalon(salons);
    const services = Object.entries(servicesBySalon).flatMap(
      ([salonId, items]) => {
        const salon = salons.find(
          (item) => String(item._id ?? item.id ?? "") === salonId,
        );
        return items.map((service) => ({
          ...service,
          salonId,
          salonName: salon?.name,
          city: salon?.city,
        }));
      },
    );
    const directPlatform = {
      salonsText: "",
      servicesText: "",
      citiesText: [
        ...new Set(
          salons.map((salon) => salon.city).filter(Boolean) as string[],
        ),
      ].join(", "),
      categoriesText: "",
      raw: { salons, services, categories: [] },
      semanticMemory: undefined,
    };
    let direct = parseClaudiaDirectIntent({
      text: userInput,
      platformKnowledge: directPlatform,
      collectedBookingFields,
    });
    const lastAssistantText = [...history]
      .reverse()
      .find(
        (item): item is Extract<ThreadItem, { type: "message" }> =>
          item.type === "message" && item.data.role === "assistant",
      )?.data.content;
    const priceFollowUp =
      /za koju uslugu ili salon|za koji grad ili salon|cenovnik|cene/i.test(
        lastAssistantText ?? "",
      );
    if (
      priceFollowUp &&
      (direct.entities.service ||
        direct.entities.city ||
        direct.entities.salonName)
    ) {
      direct = {
        ...direct,
        type: "prices",
        confidence: Math.max(direct.confidence, 0.86),
      };
    }

    if (direct.type === "appointments") {
      return askAgent(
        userInput,
        isAuthenticated,
        history,
        userName,
        isBlockInteraction,
        collectedBookingFields,
        {
          intent: "appointments",
        },
      );
    }

    if (direct.type === "auth") {
      return askAgent(
        userInput,
        isAuthenticated,
        history,
        userName,
        isBlockInteraction,
        collectedBookingFields,
        {
          intent: "login",
        },
      );
    }

    if (direct.type === "prices") {
      const city = direct.entities.city ?? collectedBookingFields?.city;
      const service =
        direct.entities.service ??
        collectedBookingFields?.service ??
        collectedBookingFields?.category;
      const salonName =
        direct.entities.salonName ?? collectedBookingFields?.salonName;
      const matchedSalon = salonName
        ? salons.find((salon) =>
            normalizeSemanticTerm(salon.name ?? "").includes(
              normalizeSemanticTerm(salonName),
            ),
          )
        : undefined;

      if (!service && !salonName) {
        return streamClaudiaContract(
          makeClaudiaContract({
            kind: "prices",
            message: "Za koju uslugu ili salon?",
            workflowDomain: "prices",
            step: "prices_missing_subject",
            nextAction: "ASK_CLARIFICATION",
            intentType: "prices",
            status: "waiting_for_user",
            reason: "direct_prices_missing_subject",
            missingFields: ["service_or_salon"],
          }),
        );
      }

      if (service && !city && !matchedSalon) {
        return streamClaudiaContract(
          makeClaudiaContract({
            kind: "prices",
            message: "Za koji grad ili salon?",
            workflowDomain: "prices",
            step: "prices_missing_city_or_salon",
            nextAction: "ASK_CLARIFICATION",
            intentType: "prices",
            entities: { service },
            status: "waiting_for_user",
            reason: "direct_prices_missing_city_or_salon",
            missingFields: ["city_or_salon"],
          }),
        );
      }

      const resolved = service
        ? resolveSalonsForService({
            serviceQuery: service,
            city,
            salons,
            servicesBySalon,
          })
        : { salons: [] as ResolvedServiceSalon[] };
      const priceSalons = matchedSalon
        ? [
            {
              id: String(matchedSalon._id ?? matchedSalon.id ?? ""),
              name: matchedSalon.name,
            },
          ]
        : resolved.salons.map((salon) => ({
            id: salon.salonId,
            name: salon.salonName,
          }));

      return streamClaudiaContract(
        makeClaudiaContract({
          kind: "prices",
          message: service
            ? `Prikazujem cene za ${service}${city ? ` u ${city}` : ""}.`
            : `Prikazujem cenovnik salona ${matchedSalon?.name}.`,
          workflowDomain: "prices",
          step:
            matchedSalon || priceSalons.length <= 1
              ? "show_service_prices"
              : "choose_salon",
          nextAction: "SHOW_PRICES",
          intentType: "prices",
          blocks:
            matchedSalon || priceSalons.length <= 1
              ? [
                  {
                    type: "ServicePriceBlock",
                    priority: 1,
                    metadata: {
                      serviceId: "",
                      serviceName: service ?? "",
                      variantName: "",
                      service: service ?? "",
                      salonId: matchedSalon
                        ? String(matchedSalon._id ?? matchedSalon.id ?? "")
                        : (priceSalons[0]?.id ?? ""),
                      salonName:
                        matchedSalon?.name ?? priceSalons[0]?.name ?? "",
                    },
                  },
                ]
              : [
                  buildSalonListBlock({
                    city,
                    service,
                    salons: priceSalons.map((salon) => ({
                      id: salon.id,
                      name: salon.name ?? "",
                    })),
                  }),
                ],
          entities: {
            city,
            service,
            salonId: matchedSalon
              ? String(matchedSalon._id ?? matchedSalon.id ?? "")
              : priceSalons[0]?.id,
            salonName: matchedSalon?.name ?? priceSalons[0]?.name,
            salons: priceSalons,
          },
          status:
            priceSalons.length > 1 && !matchedSalon
              ? "waiting_for_user"
              : "ready",
          reason: "direct_prices",
        }),
      );
    }

    if (direct.type === "salon_info") {
      const availability = resolveCityServiceAvailability({
        city: direct.entities.city,
        service: direct.entities.service,
        category: direct.entities.category,
        platformKnowledge: directPlatform,
      });
      const alternatives = availability.nearestAlternatives
        .map((item) => item.city)
        .filter((city): city is string => Boolean(city))
        .slice(0, 2);
      const message = availability.hasSalonInCity
        ? `Da, imamo salon u ${direct.entities.city}: ${availability.matchingSalons
            .map((salon) => salon.name)
            .filter(Boolean)
            .join(", ")}.`
        : direct.entities.city
          ? alternatives.length > 0
            ? `Trenutno nemamo salon u ${inCity(direct.entities.city)}. Najbliže opcije su ${alternatives.join(" i ")}. Koja usluga vas zanima?`
            : formatNearestSalonAnswer({ requestedCity: direct.entities.city })
          : "Za koji grad da proverim salone?";
      return streamClaudiaContract(
        makeClaudiaContract({
          kind: "booking_result",
          message,
          workflowDomain: "booking",
          step: "direct_salon_info",
          nextAction: "NONE",
          intentType: "salon_info",
          entities: direct.entities,
          status: "ready",
          reason: "direct_salon_info",
        }),
      );
    }

    if (direct.type === "follow_up" || direct.type === "booking") {
      const directSalon = direct.entities.salonName
        ? salons.find((salon) =>
            normalizeSemanticTerm(salon.name ?? "").includes(
              normalizeSemanticTerm(direct.entities.salonName ?? ""),
            ),
          )
        : undefined;
      const bookingPayload = {
        intent: "booking",
        city:
          direct.entities.city ??
          directSalon?.city ??
          collectedBookingFields?.city,
        service:
          direct.entities.service ??
          collectedBookingFields?.service ??
          collectedBookingFields?.serviceName,
        category: direct.entities.category ?? collectedBookingFields?.category,
        salonName:
          direct.entities.salonName ?? collectedBookingFields?.salonName,
        salonId: directSalon
          ? String(directSalon._id ?? directSalon.id ?? "")
          : collectedBookingFields?.salonId,
        date: direct.entities.date ?? collectedBookingFields?.date,
        dateMode: direct.entities.dateMode,
        time: direct.entities.time ?? collectedBookingFields?.time,
        timeWindowStart:
          direct.entities.timeWindowStart ??
          collectedBookingFields?.timeWindowStart,
        timeWindowEnd:
          direct.entities.timeWindowEnd ??
          collectedBookingFields?.timeWindowEnd,
      };
      return askAgent(
        userInput,
        isAuthenticated,
        history,
        userName,
        isBlockInteraction,
        collectedBookingFields,
        bookingPayload,
      );
    }
  }

  if (handoffPayload?.intent === "appointments") {
    const message = isAuthenticated
      ? "Pozdrav, izvolite vaše termine."
      : "Prijavi se da vidiš svoje termine.";
    const blocks = [
      isAuthenticated
        ? {
            type: "CalendarBlock",
            priority: 1,
            metadata: {
              mode: "list",
              appointmentListMode: "all",
              serviceId: "",
              serviceName: "",
              variantName: "",
            },
          }
        : {
            type: "AuthBlock",
            priority: 1,
            metadata: {
              mode: "login",
              intent: "appointments",
              serviceId: "",
              serviceName: "",
              variantName: "",
            },
          },
    ];
    return streamClaudiaContract(
      makeClaudiaContract({
        kind: isAuthenticated ? "appointments" : "auth",
        message,
        workflowDomain: isAuthenticated ? "appointments" : "auth",
        step: "appointments",
        nextAction: isAuthenticated ? "SHOW_APPOINTMENTS" : "SHOW_AUTH",
        intentType: "appointments",
        blocks,
        status: isAuthenticated ? "ready" : "waiting_for_user",
        reason: "appointments",
      }),
    );
  }

  if (handoffPayload?.intent === "cancel_appointment") {
    const cancellableAppointments = readCancellableAppointments(handoffPayload);
    if (!isAuthenticated) {
      return streamClaudiaContract(
        makeAuthContract({
          message: "Prijavi se da možeš da otkažeš termin.",
          intentType: "cancel_appointment",
          blocks: [
            {
              type: "AuthBlock",
              priority: 1,
              metadata: {
                mode: "login",
                intent: "cancel_appointment",
                serviceId: "",
                serviceName: "",
                variantName: "",
              },
            },
          ],
          step: "cancel_appointment",
        }),
      );
    }
    if (cancellableAppointments.length === 1) {
      const appointment = cancellableAppointments[0];
      const service = String(appointment.serviceName ?? "termin");
      const message = `Pronašla sam termin za ${service} ${appointmentDateTimeText(appointment)}. Možeš odmah da ga otkažeš.`;
      return streamClaudiaContract(
        makeClaudiaContract({
          kind: "confirmation",
          message,
          workflowDomain: "appointments",
          step: "confirm_cancel_appointment",
          nextAction: "SHOW_CANCEL_CONFIRMATION",
          intentType: "confirm_cancel_appointment",
          entities: { appointmentId: appointment._id },
          blocks: [
            {
              type: "AppointmentCancelConfirmBlock",
              priority: 1,
              metadata: {
                serviceId: "",
                serviceName: service,
                variantName: "",
                appointmentId: appointment._id,
                appointment,
              },
            },
          ],
          reason: "confirm_cancel_appointment",
        }),
      );
    }
    if (cancellableAppointments.length > 1 || !handoffPayload?.appointments) {
      return streamClaudiaContract(
        makeAppointmentsContract({
          message: "Izaberi termin koji želiš da otkažeš.",
          intentType: "cancel_appointment",
          step: "cancel_appointment",
          blocks: [
            {
              type: "CalendarBlock",
              priority: 1,
              metadata: {
                mode: "list",
                appointmentListMode: "can_cancel",
                intent: "cancel_appointment",
                serviceId: "",
                serviceName: "",
                variantName: "",
              },
            },
          ],
        }),
      );
    }
    return streamClaudiaContract(
      makeClaudiaContract({
        kind: "appointments",
        message: "Nemate termina koje trenutno možete da otkažete.",
        workflowDomain: "appointments",
        step: "cancel_appointment",
        nextAction: "NONE",
        intentType: "cancel_appointment",
        reason: "no_cancellable_appointments",
      }),
    );
  }

  if (handoffPayload?.intent === "update_appointment") {
    // When a specific appointmentId is provided (from reschedule button click),
    // use that appointment directly instead of falling back to the full list.
    const specificAppointmentId = typeof handoffPayload?.appointmentId === "string"
      ? handoffPayload.appointmentId
      : null;
    const specificAppointment =
      specificAppointmentId &&
      typeof handoffPayload?.appointment === "object" &&
      handoffPayload.appointment
        ? (handoffPayload.appointment as Record<string, unknown>)
        : null;

    const activeAppointments = specificAppointment
      ? [specificAppointment]
      : readActiveAppointments(handoffPayload);
    if (!isAuthenticated) {
      return streamClaudiaContract(
        makeAuthContract({
          message: "Prijavi se da možeš da promeniš termin.",
          intentType: "update_appointment",
          blocks: [
            {
              type: "AuthBlock",
              priority: 1,
              metadata: {
                mode: "login",
                intent: "update_appointment",
                serviceId: "",
                serviceName: "",
                variantName: "",
              },
            },
          ],
          step: "update_appointment",
        }),
      );
    }
    if (activeAppointments.length === 1) {
      const appointment = activeAppointments[0];
      const service = String(appointment.serviceName ?? "");
      const city = String(appointment.city ?? appointment.salonCity ?? "");
      const salonId = String(appointment.salonId ?? "");
      const salonName = String(appointment.salonName ?? "");
      if (service && city) {
        const searchResult = await runBookingSearch({
          service,
          city,
          salonId,
          salonName,
        });
        const alternatives = searchResult.results
          .filter((slot) => !salonId || slot.salonId === salonId)
          .slice(0, 3);
        const blocks =
          alternatives.length > 0
            ? [
                buildAppointmentBlock({
                  service,
                  city,
                  salonId: salonId || undefined,
                  salonName: salonName || undefined,
                  slots: alternatives,
                }),
              ]
            : [];
        return streamClaudiaContract(
          makeBookingResultContract({
            message:
              alternatives.length > 0
                ? "Pronašla sam nekoliko slobodnih alternativa za isti termin."
                : "Trenutno ne vidim slobodne alternative za taj termin.",
            intentType: "confirm_update_appointment",
            step: "confirm_update_appointment",
            blocks,
            entities: { appointmentId: appointment._id },
            nextAction: alternatives.length > 0 ? "SHOW_SLOTS" : "NONE",
          }),
        );
      }
    }

    return streamClaudiaContract(
      makeAppointmentsContract({
        message:
          activeAppointments.length === 1
            ? "Proveravam najbliže slobodne alternative za isti termin."
            : "Izaberi termin koji želiš da promeniš.",
        intentType: "update_appointment",
        step: "update_appointment",
        blocks: [
          {
            type: "CalendarBlock",
            priority: 1,
            metadata: {
              mode: "list",
              appointmentListMode: "all",
              intent: "update_appointment",
              serviceId: "",
              serviceName: "",
              variantName: "",
            },
          },
        ],
      }),
    );
  }

  if (handoffPayload?.intent === "prices") {
    const city = asString(handoffPayload.city) ?? collectedBookingFields?.city;
    if (!city) {
      return streamClaudiaContract(
        makeClaudiaContract({
          kind: "prices",
          message: "Za koji grad želiš da vidiš cenovnik?",
          workflowDomain: "prices",
          step: "missing_city",
          nextAction: "ASK_CLARIFICATION",
          intentType: "prices",
          blocks: [
            {
              type: "CityListBlock",
              priority: 1,
              metadata: {
                serviceId: "",
                serviceName: "",
                variantName: "",
                service: "",
              },
            },
          ],
          status: "waiting_for_user",
          reason: "prices_missing_city",
          missingFields: ["city"],
        }),
      );
    }
    // City is already known — fall through to LLM which applies CENOVNIK FLOW step 2/3
    // (booking memory section injects the city so Claudia goes straight to SalonListBlock).
  }

  if (handoffPayload?.intent === "recover_missing_salon") {
    const city = String(handoffPayload.city ?? "");
    const service = String(handoffPayload.service ?? "");
    const salons = Array.isArray(handoffPayload.salons)
      ? handoffPayload.salons
          .filter((salon): salon is { id: string; name: string } => {
            if (!salon || typeof salon !== "object") return false;
            const record = salon as Record<string, unknown>;
            return (
              typeof record.id === "string" && typeof record.name === "string"
            );
          })
          .map((salon) => ({ id: salon.id, name: salon.name }))
      : [];

    return streamClaudiaContract(
      makeRecoveryContract({
        message: "Izaberi salon za ovaj termin.",
        intentType: "recover_missing_salon",
        step: "recover_missing_salon",
        entities: { city, service },
        nextAction: "SHOW_SALONS",
        blocks: [
          {
            type: "SalonListBlock",
            priority: 1,
            metadata: {
              serviceId: "",
              serviceName: service,
              variantName: "",
              service,
              city,
              salons,
            },
          },
        ],
      }),
    );
  }

  if (
    isFollowUpTimeCorrection &&
    (!handoffPayload?.intent ||
      handoffPayload.intent === "booking" ||
      handoffPayload.intent === "update_booking_selection")
  ) {
    const time = exactTimeAtInput;
    if (time) {
      const nextFlowVersion = bookingFlow.get().cancelPendingSelectionFlow();
      const updatedIntent: StructuredBookingIntent = {
        city: mergedBookingContext.city,
        requestedCity: mergedBookingContext.city,
        service:
          mergedBookingContext.service ?? mergedBookingContext.serviceName,
        serviceId: mergedBookingContext.serviceId,
        serviceName:
          mergedBookingContext.serviceName ?? mergedBookingContext.service,
        category: mergedBookingContext.category,
        subcategory: mergedBookingContext.subcategory,
        salonId: mergedBookingContext.salonId,
        salonName: mergedBookingContext.salonName,
        date: mergedBookingContext.date,
        time,
        timeWindowStart: null,
        timeWindowEnd: null,
      };
      bookingFlow.get().collect({
        category: updatedIntent.category,
        subcategory: updatedIntent.subcategory,
        service: updatedIntent.service,
        serviceId: updatedIntent.serviceId,
        serviceName: updatedIntent.serviceName,
        city: updatedIntent.city,
        salonId: updatedIntent.salonId,
        salonName: updatedIntent.salonName,
        date: updatedIntent.date,
        time,
        timeWindowStart: null,
        timeWindowEnd: null,
      });
      bookingFlow.get().setState("reviewing_slots");

      console.debug("[BOOKING_MEMORY_UPDATE]", {
        changedFields: ["time"],
        flowVersion: nextFlowVersion,
        before: mergedBookingContext,
        after: updatedIntent,
      });

      const searchResult = await runBookingSearch(updatedIntent);
      const exact = filterSearchResultByExactTime(searchResult, time);
      const exactSlots = exact.results.slice(0, 1);

      if (exactSlots.length > 0) {
        return streamClaudiaContract(
          makeBookingResultContract({
            message: `${time} je slobodan termin za ${updatedIntent.serviceName ?? updatedIntent.service} u salonu ${updatedIntent.salonName}.`,
            intentType: "update_booking_selection",
            step: "booking_confirm_time",
            blocks: [
              buildAppointmentBlock({
                mode: "confirmation_form",
                category: updatedIntent.category,
                subcategory: updatedIntent.subcategory,
                service: updatedIntent.service,
                serviceId: updatedIntent.serviceId,
                serviceName: updatedIntent.serviceName,
                city: updatedIntent.city,
                date: updatedIntent.date,
                time,
                timeWindowStart: null,
                timeWindowEnd: null,
                salonId: updatedIntent.salonId,
                salonName: updatedIntent.salonName,
                slots: exactSlots,
              }),
            ],
            entities: { ...updatedIntent },
            nextAction: "SHOW_SLOTS",
            status: "waiting_for_user",
          }),
        );
      }

      const requestedStartMinutes = parseTimeLabelToMinutes(time);
      const requestedDuration = inferRequestedDurationMinutes(
        searchResult,
        updatedIntent,
      );
      const alternativesStartMinutes =
        requestedStartMinutes != null && requestedDuration != null
          ? requestedStartMinutes + requestedDuration
          : requestedStartMinutes;
      const alternativesStartLabel =
        alternativesStartMinutes != null
          ? normalizeTimeLabel(alternativesStartMinutes)
          : time;
      const alternatives =
        alternativesStartMinutes != null
          ? filterSearchResultByStartMinutes(
              searchResult,
              alternativesStartMinutes,
              {
                inclusive: true,
              },
            ).results.slice(0, 5)
          : filterSearchResultByStartHour(
              searchResult,
              Number(time.split(":")[0]),
              {
                inclusive: false,
              },
            ).results.slice(0, 5);

      return streamClaudiaContract(
        makeBookingResultContract({
          message:
            alternatives.length > 0
              ? `${time} nije slobodan, ali mogu da ponudim najbliže termine posle ${alternativesStartLabel}.`
              : `${time} nije slobodan i trenutno ne vidim bliske alternative za taj termin.`,
          intentType: "update_booking_selection",
          step: "booking_time_alternatives",
          blocks:
            alternatives.length > 0
              ? [
                  buildAppointmentBlock({
                    mode: "slot_picker",
                    category: updatedIntent.category,
                    subcategory: updatedIntent.subcategory,
                    service: updatedIntent.service,
                    serviceId: updatedIntent.serviceId,
                    serviceName: updatedIntent.serviceName,
                    city: updatedIntent.city,
                    date: updatedIntent.date,
                    time,
                    timeWindowStart:
                      alternativesStartMinutes != null
                        ? Math.floor(alternativesStartMinutes / 60)
                        : null,
                    timeWindowEnd: null,
                    salonId: updatedIntent.salonId,
                    salonName: updatedIntent.salonName,
                    slots: alternatives,
                  }),
                ]
              : [],
          entities: {
            ...updatedIntent,
            timeWindowStart:
              alternativesStartMinutes != null
                ? Math.floor(alternativesStartMinutes / 60)
                : null,
            requestedDuration,
            alternativesStart: alternativesStartLabel,
          },
          nextAction: alternatives.length > 0 ? "SHOW_SLOTS" : "NONE",
          status: alternatives.length > 0 ? "waiting_for_user" : "ready",
        }),
      );
    }
  }

  if (
    !handoffPayload?.intent &&
    exactTimeAtInput &&
    !hasCompleteActiveBooking(mergedBookingContext)
  ) {
    return streamClaudiaContract(
      makeClarificationContract({
        message: mergedBookingContext.service
          ? "Može. U kom gradu želiš termin?"
          : "Može. Koju uslugu želiš da zakažeš?",
        step: "booking_missing_service",
        intentType: "booking",
        entities: {
          time: exactTimeAtInput,
          city: mergedBookingContext.city,
          service: mergedBookingContext.service,
        },
        missingFields: mergedBookingContext.service ? ["city"] : ["service"],
      }),
    );
  }

  if (
    !handoffPayload?.intent &&
    collectedBookingFields?.service &&
    !collectedBookingFields.city
  ) {
    const salons = await fetchBookingSalons();
    const normalizedInput = normalizeSemanticTerm(userInput);
    const city = [
      ...new Set(salons.map((salon) => salon.city).filter(Boolean) as string[]),
    ].find((candidate) => normalizeSemanticTerm(candidate) === normalizedInput);
    if (city) {
      const nextCollected = {
        ...collectedBookingFields,
        city,
      };
      console.debug("[BOOKING_MEMORY_MERGE]", {
        before: collectedBookingFields,
        incoming: { city },
        after: nextCollected,
      });
      return askAgent(
        userInput,
        isAuthenticated,
        history,
        userName,
        isBlockInteraction,
        nextCollected,
        { intent: "select_city", city },
      );
    }
  }

  if (handoffPayload?.intent === "booking") {
    const intent = buildIntentFromHandoff(
      handoffPayload,
      collectedBookingFields,
    );
    const serviceDescriptor = describeBookingService(
      intent.service,
      intent.category,
    );

    if (intent.service && !intent.city) {
      const salons = await fetchBookingSalons();
      const servicesBySalon = await fetchServicesBySalon(salons);
      const resolved = resolveSalonsForService({
        serviceQuery: intent.service,
        salons,
        servicesBySalon,
      });
      const counts = new Map<string, number>();
      for (const salon of resolved.salons) {
        if (!salon.city) continue;
        counts.set(salon.city, (counts.get(salon.city) ?? 0) + 1);
      }
      const cities =
        counts.size > 0
          ? [...counts.entries()]
              .sort(([a], [b]) => a.localeCompare(b, "sr"))
              .map(([name, salonCount]) => ({ name, salonCount }))
          : matchingCityItems(salons, {
              service: intent.service,
              category: intent.category,
            });
      if (cities.length > 0) bookingFlow.get().startPendingSelectionFlow();
      return streamClaudiaContract(
        makeClaudiaContract({
          kind: "clarification",
          message: `U kom gradu želiš termin za ${intent.service}?`,
          workflowDomain: "booking",
          step: "booking_missing_city",
          nextAction: "ASK_CLARIFICATION",
          intentType: "booking",
          blocks: [
            buildCityListBlock({
              service: intent.service,
              category: serviceDescriptor.category,
              cities,
            }),
          ],
          entities: {
            ...intent,
            category: serviceDescriptor.category,
            cities,
          },
          status: "waiting_for_user",
          reason: "booking_missing_city",
          missingFields: ["city"],
        }),
      );
    }

    if (intent.service && intent.city && !intent.salonId && !intent.salonName) {
      const salons = await fetchBookingSalons();
      const servicesBySalon = await fetchServicesBySalon(salons);
      const resolved = resolveSalonsForService({
        serviceQuery: intent.service,
        city: intent.city,
        salons,
        servicesBySalon,
      });

      const exactResolved = resolved.salons.filter((salon) =>
        salon.matchingServices.some(
          (service) => service.matchReason === "exact",
        ),
      );
      const directSalon = exactResolved.length === 1 ? exactResolved[0] : null;
      const directService =
        directSalon?.matchingServices.filter(
          (service) => service.matchReason === "exact",
        ).length === 1
          ? directSalon.matchingServices.find(
              (service) => service.matchReason === "exact",
            )
          : null;

      if (directSalon && directService && hasDateAndTimeIntent(intent)) {
        const directIntent: StructuredBookingIntent = {
          ...intent,
          serviceId: directService.serviceId,
          serviceName: directService.serviceName,
          category: directService.category ?? intent.category,
          subcategory: directService.subcategory ?? intent.subcategory,
          salonId: directSalon.salonId,
          salonName: directSalon.salonName,
        };
        const searchResult = await runBookingSearch(directIntent);
        const filtered = filterSearchResultByStartHour(
          searchResult,
          directIntent.timeWindowStart,
          {
            inclusive: isInclusiveStartRequest(
              userInput,
              directIntent.timeWindowStart,
            ),
          },
        );
        const slots = filtered.results.slice(0, 5);
        if (slots.length > 0) {
          return streamClaudiaContract(
            makeBookingResultContract({
              message: bookingSearchMessage({
                intent: directIntent,
                slots,
                originalCount: searchResult.results.length,
              }),
              intentType: "booking",
              step: "booking",
              blocks: [
                buildAppointmentBlock({
                  category: directIntent.category,
                  subcategory: directIntent.subcategory,
                  service: directIntent.service,
                  serviceId: directIntent.serviceId,
                  serviceName: directIntent.serviceName,
                  city: directIntent.requestedCity ?? directIntent.city,
                  date: directIntent.date,
                  time: directIntent.time,
                  timeWindowStart: directIntent.timeWindowStart,
                  timeWindowEnd: directIntent.timeWindowEnd,
                  salonId: directIntent.salonId,
                  salonName: directIntent.salonName,
                  slots,
                }),
              ],
              entities: { ...directIntent },
              nextAction: "SHOW_SLOTS",
            }),
          );
        }
      }

      if (resolved.salons.length > 0)
        bookingFlow.get().startPendingSelectionFlow();
      return streamClaudiaContract(
        makeBookingResultContract({
          message:
            resolved.salons.length > 0
              ? `Dostupni saloni u ${inCity(intent.city)} za ${intent.service}.`
              : `Nema salona za ${intent.service} u ${inCity(intent.city)}. Mogu da proverim najbliži drugi grad ili da te obavestim kada se pojavi termin.`,
          intentType: "booking",
          step: "booking_select_salon",
          blocks: [
            ...(resolved.salons.length > 0
              ? [
                  buildSalonListBlockFromResolved({
                    city: intent.city,
                    service: intent.service,
                    category: serviceDescriptor.category,
                    date: intent.date,
                    time: intent.time,
                    timeWindowStart: intent.timeWindowStart,
                    timeWindowEnd: intent.timeWindowEnd,
                    salons: resolved.salons,
                  }),
                ]
              : []),
          ],
          entities: {
            ...intent,
            category: serviceDescriptor.category,
            salons: resolved.salons,
          },
          nextAction: resolved.salons.length > 0 ? "SHOW_SALONS" : "NONE",
          status: resolved.salons.length > 0 ? "waiting_for_user" : "ready",
        }),
      );
    }

    console.debug("[CLAUDIA_SEARCH]", {
      originalUserMessage: userInput,
      parsedPayload: handoffPayload,
      intent,
      timeWindowStart: intent.timeWindowStart,
      timeWindowEnd: intent.timeWindowEnd,
      authState: { isAuthenticated, userName },
    });

    const searchResult = await runBookingSearch(intent);
    const filtered = filterSearchResultByStartHour(
      searchResult,
      intent.timeWindowStart,
      { inclusive: isInclusiveStartRequest(userInput, intent.timeWindowStart) },
    );
    const slots = filtered.results.slice(0, 5);
    const message = bookingSearchMessage({
      intent,
      slots,
      originalCount: searchResult.results.length,
    });

    console.debug("[CLAUDIA_SEARCH]", {
      originalUserMessage: userInput,
      parsedPayload: handoffPayload,
      timeWindowStart: intent.timeWindowStart,
      timeWindowEnd: intent.timeWindowEnd,
      beforeFilterCount: searchResult.results.length,
      afterFilterCount: filtered.results.length,
      selectedSlot: filtered.bestSlot,
    });

    if (slots.length > 0) {
      return streamClaudiaContract(
        makeBookingResultContract({
          message,
          intentType: "booking",
          step: "booking",
          blocks: [
            buildAppointmentBlock({
              category: intent.category,
              subcategory: intent.subcategory,
              service: intent.service,
              serviceId: intent.serviceId,
              serviceName: intent.serviceName,
              city: intent.requestedCity ?? intent.city,
              date: intent.date,
              time: intent.time,
              timeWindowStart: intent.timeWindowStart,
              timeWindowEnd: intent.timeWindowEnd,
              salonId: intent.salonId,
              salonName: intent.salonName,
              slots,
            }),
          ],
          entities: { ...intent },
          nextAction: "SHOW_SLOTS",
        }),
      );
    }

    // No slots found — offer concrete next steps instead of looping.
    // Without this, the user re-sends the same message and gets the
    // same empty response indefinitely.
    const noSlotsService = intent.serviceName ?? intent.service ?? "ovu uslugu";
    const noSlotsCity = intent.requestedCity ?? intent.city;
    const noSlotsPlace = noSlotsCity ? ` u ${inCity(noSlotsCity)}` : "";
    const noSlotsDate =
      intent.dateMode === "tomorrow"
        ? " sutra"
        : intent.dateMode === "weekend"
          ? " u nedelju"
          : intent.date
            ? ` ${intent.date}`
            : "";

    const noSlotsMessage =
      searchResult.results.length > 0 && intent.timeWindowStart != null
        ? `Nema slobodnih termina${noSlotsPlace}${noSlotsDate} posle ${intent.timeWindowStart}h. Mogu da proverim ranije taj dan ili drugi dan?`
        : `Nema slobodnih termina za ${noSlotsService}${noSlotsPlace}${noSlotsDate}. Mogu da proverim drugi dan ili da te obavestim kada se pojavi slobodan termin?`;

    bookingFlow.get().collect({
      ...(intent.service ? { service: intent.service } : {}),
      ...(intent.city ? { city: intent.city } : {}),
      ...(intent.salonId ? { salonId: intent.salonId } : {}),
      ...(intent.salonName ? { salonName: intent.salonName } : {}),
    });

    return streamClaudiaContract(
      makeClaudiaContract({
        kind: "recovery",
        message: noSlotsMessage,
        workflowDomain: "booking",
        step: "no_slots",
        nextAction: "OFFER_NOTIFY_ME",
        intentType: "no_slots",
        blocks: [
          {
            type: "NotifyMeBlock",
            priority: 1,
            metadata: {
              serviceId: intent.serviceId ?? "",
              serviceName: intent.serviceName ?? intent.service ?? "",
              variantName: "",
              service: intent.service ?? "",
              category: intent.category ?? "",
              city: noSlotsCity ?? "",
              date: intent.date ?? "",
              salonId: intent.salonId ?? "",
              salonName: intent.salonName ?? "",
              flowVersion: bookingFlow.get().flowVersion,
            },
          },
        ],
        entities: {
          ...intent,
          alternatives: [],
        },
        status: "waiting_for_user",
        reason: "no_slots_found",
      }),
    );
  }

  if (handoffPayload?.intent === "booking_success") {
    const selectedSlot = handoffPayload.selectedSlot as
      | SearchResult
      | undefined;
    const service =
      asString(handoffPayload.serviceName) ??
      selectedSlot?.serviceName ??
      collectedBookingFields?.service ??
      "termin";
    const salon =
      asString(handoffPayload.salonName) ??
      selectedSlot?.salonName ??
      collectedBookingFields?.salonName ??
      "salon";
    const time =
      asString(handoffPayload.time) ??
      selectedSlot?.timeLabel ??
      collectedBookingFields?.time ??
      "";
    const statusText = isAuthenticated
      ? "Status možeš da pratiš u tabu Moji termini, a potvrda stiže na email/kontakt sa naloga."
      : "Salon će potvrdu poslati preko kontakta koji si ostavila/o.";
    bookingFlow.get().cancelPendingSelectionFlow();
    bookingFlow.get().setState("completed");
    const blocks = isAuthenticated
      ? [buildAppointmentsListBlock({ intent: "booking_success" })]
      : [
          {
            type: "AuthBlock",
            priority: 1,
            metadata: {
              mode: "login",
              intent: "booking_success",
              serviceId: "",
              serviceName: service,
              variantName: "",
              flowVersion: bookingFlow.get().flowVersion,
            },
          },
        ];

    return streamClaudiaContract(
      makeClaudiaContract({
        kind: "confirmation",
        message: `Zahtev za ${service}${time ? ` u ${time}` : ""} u salonu ${salon} je poslat i čeka potvrdu salona. ${statusText}`,
        workflowDomain: "booking",
        step: "booking_success",
        nextAction: isAuthenticated ? "SHOW_APPOINTMENTS" : "SHOW_AUTH",
        intentType: "booking_success",
        blocks,
        status: "completed",
        entities: {
          service,
          salonName: salon,
          time,
          selectedSlot,
        },
      }),
    );
  }

  if (handoffPayload?.intent === "select_city") {
    const city = String(handoffPayload.city ?? "");
    const service = String(
      handoffPayload.service ?? collectedBookingFields?.service ?? "",
    );
    const displayMessage = asString(handoffPayload.displayMessage);
    const date = collectedBookingFields?.date ?? "";
    const time = collectedBookingFields?.time ?? "";
    const timeWindowStart = collectedBookingFields?.timeWindowStart;
    const timeWindowEnd = collectedBookingFields?.timeWindowEnd;

    if (!service) {
      return streamClaudiaContract(
        makeClarificationContract({
          message:
            displayMessage ??
            `Odlično, proveravam dostupne termine u ${inCity(city)}. Koju uslugu želiš da zakažeš?`,
          step: "select_city_missing_service",
          intentType: "select_city",
          entities: { city },
          missingFields: ["service"],
        }),
      );
    }

    const serviceDescriptor = describeBookingService(
      service,
      collectedBookingFields?.category,
    );
    const salons = await fetchBookingSalons();
    const servicesBySalon = await fetchServicesBySalon(salons);
    const resolved = resolveSalonsForService({
      serviceQuery: service,
      city,
      salons,
      servicesBySalon,
    });

    if (resolved.salons.length > 0)
      bookingFlow.get().startPendingSelectionFlow();
    return streamClaudiaContract(
      makeBookingResultContract({
        message:
          displayMessage ??
          (resolved.salons.length > 0
            ? `Odlično, proveravam dostupne termine u ${inCity(city)}.`
            : `Nema salona za ${service} u ${inCity(city)}. Mogu da proverim najbliži drugi grad ili da te obavestim kada se pojavi termin.`),
        intentType: "select_city",
        step: "select_city",
        blocks:
          resolved.salons.length > 0
            ? [
                buildSalonListBlockFromResolved({
                  city,
                  service,
                  category: serviceDescriptor.category,
                  date,
                  time,
                  timeWindowStart,
                  timeWindowEnd,
                  salons: resolved.salons,
                }),
              ]
            : [],
        entities: {
          city,
          service,
          category: serviceDescriptor.category,
          date,
          time,
          timeWindowStart,
          timeWindowEnd,
          salons: resolved.salons,
        },
        nextAction: resolved.salons.length > 0 ? "SHOW_SALONS" : "NONE",
        status: resolved.salons.length > 0 ? "waiting_for_user" : "ready",
      }),
    );
  }

  if (handoffPayload?.intent === "select_salon") {
    const city = String(
      handoffPayload.city ?? collectedBookingFields?.city ?? "",
    );
    const service = String(
      handoffPayload.service ?? collectedBookingFields?.service ?? "",
    );
    const salonId = String(handoffPayload.salonId ?? "");
    const salonName = String(handoffPayload.salonName ?? "");
    const serviceId =
      asString(handoffPayload.serviceId) ?? collectedBookingFields?.serviceId;
    const serviceName = asString(handoffPayload.serviceName) ?? service;
    const date =
      asString(handoffPayload.date) ?? collectedBookingFields?.date ?? "";
    const time =
      asString(handoffPayload.time) ?? collectedBookingFields?.time ?? "";
    const payloadTimeWindowStart = asNumberOrNull(
      handoffPayload.timeWindowStart,
    );
    const payloadTimeWindowEnd = asNumberOrNull(handoffPayload.timeWindowEnd);
    const timeWindowStart =
      payloadTimeWindowStart !== undefined
        ? payloadTimeWindowStart
        : collectedBookingFields?.timeWindowStart;
    const timeWindowEnd =
      payloadTimeWindowEnd !== undefined
        ? payloadTimeWindowEnd
        : collectedBookingFields?.timeWindowEnd;
    const displayMessage = asString(handoffPayload.displayMessage);

    if (!service) {
      return streamClaudiaContract(
        makeClarificationContract({
          message:
            displayMessage ??
            `Odlično, ${salonName} je izabran. Koju uslugu želiš da zakažeš?`,
          step: "select_salon_missing_service",
          intentType: "select_salon",
          entities: { city, salonId, salonName },
          missingFields: ["service"],
        }),
      );
    }

    return streamClaudiaContract(
      makeBookingResultContract({
        message:
          displayMessage ??
          (time
            ? `Odlično, ${salonName} ima ${service}. Proveravam slobodne termine za ${time}.`
            : `Odlično, ${salonName} ima ${service}. Prikazujem slobodne termine.`),
        intentType: "select_salon",
        step: "select_salon",
        blocks: [
          buildAppointmentBlock({
            service,
            serviceId,
            serviceName,
            city,
            date,
            time,
            timeWindowStart,
            timeWindowEnd,
            salonId,
            salonName,
            category:
              asString(handoffPayload.category) ??
              collectedBookingFields?.category,
          }),
        ],
        entities: {
          city,
          service,
          serviceId,
          serviceName,
          salonId,
          salonName,
          date,
          time,
          timeWindowStart,
          timeWindowEnd,
        },
      }),
    );
  }

  if (
    handoffPayload?.intent === "login" ||
    handoffPayload?.intent === "login_for_booking"
  ) {
    const selectedSlot = handoffPayload.selectedSlot as
      | SearchResult
      | undefined;
    const message =
      handoffPayload.intent === "login_for_booking"
        ? "Prijavi se da nastavimo sa zakazivanjem."
        : "Prijavi se da nastavimo.";

    return streamClaudiaContract(
      makeAuthContract({
        message,
        intentType: String(handoffPayload.intent),
        blocks: [
          {
            type: "AuthBlock",
            priority: 1,
            metadata: {
              mode: "login",
              serviceId: "",
              serviceName: "",
              variantName: "",
              selectedSlot,
            },
          },
        ],
        step: String(handoffPayload.intent),
      }),
    );
  }

  if (handoffPayload?.intent === "resume_booking_after_login") {
    const selectedSlot = handoffPayload.selectedSlot as
      | SearchResult
      | undefined;
    const date = selectedSlot?.startTime?.split("T")[0] ?? "";
    console.debug("[AUTH_RESUME]", {
      selectedSlot,
      authState: { isAuthenticated, userName },
      restoredBookingState: handoffPayload,
    });
    const blocks = selectedSlot
      ? [
          {
            type: "AppointmentCalendarBlock",
            priority: 1,
            metadata: {
              serviceId: selectedSlot.serviceId ?? "",
              serviceName: selectedSlot.serviceName,
              variantName: "",
              service: selectedSlot.serviceName,
              category: selectedSlot.category,
              city: selectedSlot.city,
              date,
              time: selectedSlot.timeLabel,
              salonId: selectedSlot.salonId,
              salonName: selectedSlot.salonName,
              price: selectedSlot.price,
              duration: selectedSlot.serviceDuration,
              selectedSlot,
              clientName: isAuthenticated ? userName : "",
            },
          },
        ]
      : [];

    return streamClaudiaContract(
      makeBookingResultContract({
        message: selectedSlot
          ? "Uspešno si prijavljena. Nastavljamo sa zakazivanjem."
          : "Uspešno si prijavljena.",
        intentType: "resume_booking_after_login",
        step: "resume_booking_after_login",
        blocks,
        nextAction: selectedSlot ? "SHOW_SLOTS" : "NONE",
      }),
    );
  }

  if (handoffPayload?.intent === "create_booking") {
    const selectedSlot = handoffPayload.selectedSlot as
      | SearchResult
      | undefined;
    const contact = handoffPayload.contact as AiBookingContact | undefined;
    const date = selectedSlot?.startTime?.split("T")[0] ?? "";
    console.debug("[BOOKING_PREFILL]", {
      selectedSlot,
      authState: { isAuthenticated, userName },
      restoredBookingState: handoffPayload,
    });
    const blocks = selectedSlot
      ? [
          {
            type: "AppointmentCalendarBlock",
            priority: 1,
            metadata: {
              serviceId: selectedSlot.serviceId ?? "",
              serviceName: selectedSlot.serviceName,
              variantName: "",
              service: selectedSlot.serviceName,
              category: selectedSlot.category,
              city: selectedSlot.city,
              date,
              time: selectedSlot.timeLabel,
              salonId: selectedSlot.salonId,
              salonName: selectedSlot.salonName,
              price: selectedSlot.price,
              duration: selectedSlot.serviceDuration,
              selectedSlot,
              clientName: contact?.name ?? (isAuthenticated ? userName : ""),
              clientPhone: contact?.phone,
              instagram: contact?.instagram,
              contact,
            },
          },
        ]
      : [];

    return streamClaudiaContract(
      makeBookingResultContract({
        message: contact?.name
          ? `Spremno. Proveri podatke za termin za ${contact.name}.`
          : "Spremno. Proveri podatke za termin.",
        intentType: "create_booking",
        step: "create_booking",
        blocks,
        nextAction: selectedSlot ? "SHOW_SLOTS" : "NONE",
      }),
    );
  }

  if (handoffPayload?.intent === "booking_conflict") {
    const conflictSlot = handoffPayload.selectedSlot as
      | SearchResult
      | undefined;
    const service =
      asString(handoffPayload.serviceName) ??
      asString(handoffPayload.service) ??
      collectedBookingFields?.serviceName ??
      collectedBookingFields?.service ??
      "";
    const city =
      asString(handoffPayload.city) ?? collectedBookingFields?.city ?? "";
    const originalSalonId =
      asString(handoffPayload.salonId) ?? conflictSlot?.salonId ?? "";
    const originalSalonName =
      asString(handoffPayload.salonName) ?? conflictSlot?.salonName ?? "";
    const conflictDate =
      asString(handoffPayload.date) ??
      conflictSlot?.startTime?.split("T")[0] ??
      "";
    const conflictHour = (() => {
      const t = asString(handoffPayload.time) ?? conflictSlot?.timeLabel;
      if (!t) return 0;
      const h = Number(t.slice(0, 2));
      return Number.isFinite(h) ? h : 0;
    })();
    const nextDay = (() => {
      if (!conflictDate) return "";
      const d = new Date(`${conflictDate}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().split("T")[0];
    })();

    // Search 1: same city + same service + same day + after conflict time.
    // Post-filter by salon to enforce priority without needing a salonId API param.
    const sameDaySearch = await runBookingSearch({
      service,
      city,
      date: conflictDate,
      timeWindowStart: conflictHour + 1,
      timeWindowEnd: null,
    });

    const sameSalonAfter = sameDaySearch.results.filter(
      (s) => s.salonId === originalSalonId,
    );
    const otherSalonAfter = sameDaySearch.results.filter(
      (s) => s.salonId !== originalSalonId,
    );

    // Search 2: next day, same city — only if same-salon coverage is thin.
    const needNextDay = sameSalonAfter.length < 2 && !!nextDay;
    const nextDaySearch = needNextDay
      ? await runBookingSearch({ service, city, date: nextDay })
      : null;
    const nextDaySameSalon = (nextDaySearch?.results ?? []).filter(
      (s) => s.salonId === originalSalonId,
    );

    // Priority order: same salon same day → same salon next day → other salons same day
    const sameSalonSlots = [
      ...sameSalonAfter.slice(0, 2),
      ...nextDaySameSalon.slice(0, Math.max(0, 2 - sameSalonAfter.length)),
    ];
    const alternatives: SearchResult[] = [
      ...sameSalonSlots,
      ...otherSalonAfter.slice(0, Math.max(0, 3 - sameSalonSlots.length)),
    ].slice(0, 3);

    const first = alternatives[0];
    const dayLabel = first
      ? first.dateLabel === "Danas"
        ? "danas"
        : first.dateLabel === "Sutra"
          ? "sutra"
          : first.dateLabel
      : "";
    const message = first
      ? `Taj termin je u međuvremenu zauzet. Najbliži slobodan termin je ${dayLabel} u ${first.timeLabel} u ${first.salonName}. Želiš da ga rezervišem?`
      : "Taj termin je u međuvremenu zauzet. Nema više slobodnih termina za danas u ovom salonu. Mogu da proverim drugi dan ili drugu uslugu.";

    const blocks =
      alternatives.length > 0
        ? [
            buildAppointmentBlock({
              service,
              city,
              salonId: sameSalonSlots.length > 0 ? originalSalonId : undefined,
              salonName:
                sameSalonSlots.length > 0 ? originalSalonName : undefined,
              date: conflictDate,
              timeWindowStart: conflictHour + 1,
              timeWindowEnd: null,
              slots: alternatives,
            }),
          ]
        : [];

    return streamClaudiaContract(
      makeRecoveryContract({
        message,
        intentType: "booking_conflict",
        step: "slot_taken",
        blocks,
        entities: {
          service,
          city,
          salonId: originalSalonId,
          salonName: originalSalonName,
        },
        status: alternatives.length > 0 ? "ready" : "waiting_for_user",
      }),
    );
  }

  const platform = await fetchPlatformKnowledge();
  const { semanticMemory } = platform;
  // Slice platform knowledge to only what's relevant for this conversation.
  // Reduces LLM context from ~2000 tokens to ~200-600 tokens with no I/O cost.
  const platformSlice = sliceFromCollected(platform, mergedBookingContext, {
    queryType:
      (handoffPayload?.intent as
        | "booking"
        | "prices"
        | "appointments"
        | undefined) ?? "booking",
    nearestCityCandidates: Array.isArray(handoffPayload?.nearestCityCandidates)
      ? (handoffPayload.nearestCityCandidates as string[])
      : undefined,
  });
  const { salonsText, servicesText, citiesText, categoriesText } =
    platformSlice;
  const selectedSlot =
    handoffPayload?.selectedSlot &&
    typeof handoffPayload.selectedSlot === "object"
      ? (handoffPayload.selectedSlot as Record<string, unknown>)
      : undefined;
  const pendingBooking =
    handoffPayload?.pendingBooking &&
    typeof handoffPayload.pendingBooking === "object"
      ? (handoffPayload.pendingBooking as Record<string, unknown>)
      : undefined;
  const lastSystemAction = userInput.startsWith("system_action:")
    ? userInput.slice("system_action:".length)
    : undefined;
  const handoffIntent = asString(handoffPayload?.intent);
  const lastRecoveryReason =
    handoffIntent === "booking_conflict" ||
    handoffIntent === "recover_missing_salon" ||
    handoffIntent === "no_slots"
      ? handoffIntent
      : undefined;
  const memoryContext = formatAgentMemoryForPrompt(
    buildAgentMemoryContext({
      activeAgent: "claudia",
      bookingWorkflowStep: bookingWorkflow.get().step,
      bookingFlowCollected: collectedBookingFields as
        | Record<string, unknown>
        | undefined,
      selectedSlot,
      pendingBooking,
      lastSystemAction,
      lastRecoveryReason,
      contactRequired: handoffIntent === "create_booking" && !isAuthenticated,
      salonRequired:
        handoffIntent === "create_booking" ||
        handoffIntent === "booking_success",
      semanticMemory,
    }),
  );

  let systemPrompt = buildClaudiaSystemPrompt(
    salonsText,
    servicesText,
    citiesText,
    categoriesText,
    isAuthenticated,
    userName,
    memoryContext,
  );

  // Phase 1.5 — Inject booking memory so Claudia inherits Maria's payload
  // and her own previously-collected fields. Empty when nothing has been
  // gathered yet; in that case the regular SMART UX RULES apply.
  systemPrompt += buildBookingMemorySection(collectedBookingFields);

  if (isBlockInteraction) {
    systemPrompt +=
      "\n\n# BLOCK INTERACTION MODE\nKorisnik je kliknuo na blok. Odgovori SAMO kratkom instruktivnom porukom (1 rečenica). Postavi layout na prazan niz: []. Ne vraćaj nove blokove.";
  }

  const deepseekHistory = history
    .filter((item) => item.type === "message")
    .slice(-10)
    .map((item) => ({
      role:
        item.data.role === "user" ? ("user" as const) : ("assistant" as const),
      content: item.data.content,
    }));

  try {
    const stream = await getDeepseekClient().chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        ...deepseekHistory,
        { role: "user", content: userInput },
      ],
      stream: true,
      temperature: 0.2,
      response_format: { type: "json_object" as const },
    });

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              controller.enqueue(new TextEncoder().encode(content));
            }
          }
          controller.close();
        } catch (error) {
          console.error("[askAgent] Stream error:", error);
          controller.error(error);
        }
      },
    });

    return readableStream;
  } catch (error) {
    console.error("[askAgent] DeepSeek API error:", error);
    throw error;
  }
}

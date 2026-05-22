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
import {
  describeBookingService,
  matchingCityItems,
  matchingSalonItems,
} from "@/lib/ai/booking/booking-block-data";
import type { CollectedBookingFields } from "@/lib/ai/booking-flow-state";
import type { AiBookingContact } from "@/types/aiBooking";
import { runBookingSearch } from "@/lib/search/runBookingSearch";
import type { StructuredBookingIntent } from "@/types/intent";
import type { SearchApiResponse, SearchResult } from "@/types/slots";
import {
  isActiveAppointment,
  isCancellableAppointment,
  sortAppointmentsByScheduledDesc,
  type AppointmentFilterInput,
} from "@/lib/appointments/appointmentFilters";

type AppointmentPayload = Record<string, unknown> & AppointmentFilterInput;

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

function buildClaudiaSystemPrompt(
  salonsText: string,
  servicesText: string,
  citiesText: string,
  categoriesText: string,
  isAuthenticated: boolean,
  userName: string,
): string {
  const currentDate = new Date().toLocaleDateString("sr-RS", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split("T")[0];
  const dayAfter = new Date(Date.now() + 172_800_000).toISOString().split("T")[0];

  return `
# IDENTITY

Ti si **Claudia**, AI booking orchestrator za Marysoll Booking platformu.
Obraćaj se korisniku u ženskom rodu.
Ton: profesionalan, brz, jasan, moderan UX stil, kao recepcionarka poznatog hotela sa 5 zvezdica. Bez emojia.

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
  return {
    kind: input.kind,
    message: input.message,
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
    nextAction: input.nextAction ?? (input.blocks.length > 0 ? "SHOW_SLOTS" : "NONE"),
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
    nextAction: input.nextAction ?? (input.blocks.length > 0 ? "SHOW_RECOVERY_ALTERNATIVES" : "NONE"),
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
}) {
  return {
    type: "AppointmentCalendarBlock",
    priority: 1,
    metadata: {
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
    },
  };
}

function inCity(city: string): string {
  if (city === "Bor") return "Boru";
  if (city === "Novi Sad") return "Novom Sadu";
  if (city === "Beograd") return "Beogradu";
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
    payloadTimeWindowEnd !== undefined ? payloadTimeWindowEnd : collected?.timeWindowEnd;

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
    time: asString(handoffPayload.time) ?? collected?.time,
    timeWindowStart,
    timeWindowEnd,
    earliestTime:
      timeWindowStart != null
        ? `${String(timeWindowStart).padStart(2, "0")}:00`
        : asString(handoffPayload.earliestTime),
    latestTime: asString(handoffPayload.latestTime),
    queryType: asString(handoffPayload.queryType) as StructuredBookingIntent["queryType"],
  };
}

function slotHour(slot: SearchResult): number {
  const labelHour = Number(slot.timeLabel?.slice(0, 2));
  if (Number.isFinite(labelHour)) return labelHour;
  const isoHour = Number(slot.startTime?.slice(11, 13));
  return Number.isFinite(isoHour) ? isoHour : 0;
}

export function filterSearchResultByStartHour(
  searchResult: SearchApiResponse,
  timeWindowStart?: number | null,
): SearchApiResponse {
  if (timeWindowStart == null) return searchResult;
  const keep = (slot: SearchResult) => slotHour(slot) >= timeWindowStart;
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

function bookingSearchMessage(input: {
  intent: StructuredBookingIntent;
  slots: SearchResult[];
  originalCount: number;
}): string {
  const service = input.intent.serviceName ?? input.intent.service ?? "traženu uslugu";
  const city = input.intent.requestedCity ?? input.intent.city;
  const place = city ? ` u ${city}` : "";
  const after = input.intent.timeWindowStart != null ? ` posle ${input.intent.timeWindowStart}h` : "";
  if (input.slots.length > 0) {
    return `Pozdrav, imamo slobodne termine za uslugu ${service}${place}${after}.`;
  }
  if (input.intent.timeWindowStart != null && input.originalCount > 0) {
    return `Nema slobodnih termina${place} posle ${input.intent.timeWindowStart}h; mogu da proverim drugi dan ili širi vremenski okvir.`;
  }
  return `Trenutno nema slobodnih termina za ${service}${place}; mogu da proverim drugi dan ili drugu uslugu.`;
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
  return raw
    .filter((appointment): appointment is Record<string, unknown> =>
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
      console.error("[askAgent] Unknown intent from Maria, refusing LLM fallback:", handoffPayload.intent);
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
    const activeAppointments = readActiveAppointments(handoffPayload);
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
            return typeof record.id === "string" && typeof record.name === "string";
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

  if (handoffPayload?.intent === "booking") {
    const intent = buildIntentFromHandoff(handoffPayload, collectedBookingFields);
    const serviceDescriptor = describeBookingService(intent.service, intent.category);

    if (intent.service && !intent.city) {
      const salons = await fetchBookingSalons();
      const cities = matchingCityItems(salons, {
        service: intent.service,
        category: intent.category,
      });
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
      const matchingSalons = matchingSalonItems(salons, {
        city: intent.city,
        service: intent.service,
        category: intent.category,
      });
      return streamClaudiaContract(
        makeBookingResultContract({
          message:
            matchingSalons.length > 0
              ? `Dostupni saloni u ${inCity(intent.city)} za ${intent.service}.`
              : `Nema salona za ${intent.service} u ${inCity(intent.city)}. Prikazujem najbliže dostupne opcije.`,
          intentType: "booking",
          step: "booking_select_salon",
          blocks: [
            buildSalonListBlock({
              city: intent.city,
              service: intent.service,
              category: serviceDescriptor.category,
              salons: matchingSalons,
            }),
          ],
          entities: {
            ...intent,
            category: serviceDescriptor.category,
            salons: matchingSalons,
          },
          nextAction: "SHOW_SALONS",
          status: matchingSalons.length > 0 ? "waiting_for_user" : "ready",
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

    const blocks =
      slots.length > 0
        ? [
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
          ]
        : [];
    return streamClaudiaContract(
      makeBookingResultContract({
        message,
        intentType: "booking",
        step: "booking",
        blocks,
        entities: { ...intent },
        nextAction: slots.length > 0 ? "SHOW_SLOTS" : "NONE",
      }),
    );
  }

  if (handoffPayload?.intent === "booking_success") {
    const selectedSlot = handoffPayload.selectedSlot as SearchResult | undefined;
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

    return streamClaudiaContract(
      makeClaudiaContract({
        kind: "confirmation",
        message: `Zahtev za ${service}${time ? ` u ${time}` : ""} u salonu ${salon} je poslat i čeka potvrdu salona. ${statusText}`,
        workflowDomain: "booking",
        step: "booking_success",
        nextAction: "NONE",
        intentType: "booking_success",
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
    const service = String(handoffPayload.service ?? collectedBookingFields?.service ?? "");
    const date = collectedBookingFields?.date ?? "";
    const time = collectedBookingFields?.time ?? "";
    const timeWindowStart = collectedBookingFields?.timeWindowStart;
    const timeWindowEnd = collectedBookingFields?.timeWindowEnd;

    if (!service) {
      return streamClaudiaContract(
        makeClarificationContract({
          message: `Izabrala si ${city}. Koju uslugu želiš da zakažeš?`,
          step: "select_city_missing_service",
          intentType: "select_city",
          entities: { city },
          missingFields: ["service"],
        }),
      );
    }

    const serviceDescriptor = describeBookingService(service, collectedBookingFields?.category);
    const salons = await fetchBookingSalons();
    const matchingSalons = matchingSalonItems(salons, {
      city,
      service,
      category: collectedBookingFields?.category,
    });

    return streamClaudiaContract(
      makeBookingResultContract({
        message:
          matchingSalons.length > 0
            ? `Dostupni saloni u ${inCity(city)} za ${service}.`
            : `Nema salona za ${service} u ${inCity(city)}. Prikazujem najbliže dostupne opcije.`,
        intentType: "select_city",
        step: "select_city",
        blocks: [
          buildSalonListBlock({
            city,
            service,
            category: serviceDescriptor.category,
            salons: matchingSalons,
          }),
        ],
        entities: {
          city,
          service,
          category: serviceDescriptor.category,
          date,
          time,
          timeWindowStart,
          timeWindowEnd,
          salons: matchingSalons,
        },
        nextAction: "SHOW_SALONS",
        status: "waiting_for_user",
      }),
    );
  }

  if (handoffPayload?.intent === "select_salon") {
    const city = String(handoffPayload.city ?? collectedBookingFields?.city ?? "");
    const service = String(handoffPayload.service ?? collectedBookingFields?.service ?? "");
    const salonId = String(handoffPayload.salonId ?? "");
    const salonName = String(handoffPayload.salonName ?? "");
    const date = asString(handoffPayload.date) ?? collectedBookingFields?.date ?? "";
    const time = asString(handoffPayload.time) ?? collectedBookingFields?.time ?? "";
    const timeWindowStart =
      asNumberOrNull(handoffPayload.timeWindowStart) ??
      collectedBookingFields?.timeWindowStart;
    const timeWindowEnd =
      asNumberOrNull(handoffPayload.timeWindowEnd) ??
      collectedBookingFields?.timeWindowEnd;

    if (!service) {
      return streamClaudiaContract(
        makeClarificationContract({
          message: `Izabrala si ${salonName}. Koju uslugu želiš da zakažeš?`,
          step: "select_salon_missing_service",
          intentType: "select_salon",
          entities: { city, salonId, salonName },
          missingFields: ["service"],
        }),
      );
    }

    return streamClaudiaContract(
      makeBookingResultContract({
        message: time
          ? `Izabrala si ${salonName}. Nastavljamo sa ${service} u ${time}.`
          : `Izabrala si ${salonName}. Nastavljamo sa ${service}.`,
        intentType: "select_salon",
        step: "select_salon",
        blocks: [
          buildAppointmentBlock({
            service,
            city,
            date,
            time,
            timeWindowStart,
            timeWindowEnd,
            salonId,
            salonName,
            category: asString(handoffPayload.category) ?? collectedBookingFields?.category,
          }),
        ],
        entities: {
          city,
          service,
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
    const selectedSlot = handoffPayload.selectedSlot as SearchResult | undefined;
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
    const selectedSlot = handoffPayload.selectedSlot as SearchResult | undefined;
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
    const selectedSlot = handoffPayload.selectedSlot as SearchResult | undefined;
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
    const conflictSlot = handoffPayload.selectedSlot as SearchResult | undefined;
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
              salonName: sameSalonSlots.length > 0 ? originalSalonName : undefined,
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

  const { salonsText, servicesText, citiesText, categoriesText } =
    await fetchPlatformKnowledge();

  let systemPrompt = buildClaudiaSystemPrompt(
    salonsText,
    servicesText,
    citiesText,
    categoriesText,
    isAuthenticated,
    userName,
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
      role: item.data.role === "user" ? ("user" as const) : ("assistant" as const),
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

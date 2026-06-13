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
  getMissingBookingFields,
  type CollectedBookingFields,
} from "@/lib/ai/booking-flow-state";
import { chooseBlockForMissingField } from "@/lib/ai/block-registry";
import {
  buildCatalogContext,
  catalogDataFromPlatformKnowledge,
  type CatalogContext as IntentCatalog,
} from "@/lib/ai/catalog/catalog-context";
import {
  fetchEpisodicMemory,
  recordAgentEpisode,
  type EpisodeRecallKey,
} from "@/lib/ai/memory/agentEpisodeStore";
import type { AiBookingContact } from "@/types/aiBooking";
import { runBookingSearch } from "@/lib/search/runBookingSearch";
import { normalizeSemanticTerm } from "@/lib/search/serviceSemanticMap";
import { buildConversationSummary } from "@/lib/ai/buildConversationSummary";
import { repairClaudiaJson } from "@/lib/ai/anthropic-client";
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
O sebi govoriš u ženskom rodu ("proverila sam", "pronašla sam").
Korisniku se UVEK obraćaš sa Vi (persiranje): "želite", "izvolite", "možete" — nikada "ti" forme.
Ton: topla, srdačna i sigurna recepcionerka hotela sa 5 zvezdica — jasno, kratko, bez tehničkog žargona. Bez emojija.

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
  metadata: { "service": "naziv usluge", "category": "kategorija usluge" }
  ⚠ Listu gradova ("cities") popunjava SERVER iz baze — NIKADA ne navodi gradove sam.

SalonListBlock:
  metadata: { "city": "naziv grada", "service": "naziv usluge", "category": "kategorija usluge" }
  ⚠ Listu salona ("salons") popunjava SERVER iz baze — NIKADA ne izmišljaj salone ni ID-jeve.

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
# PRETHODNE EPIZODE (Episodic memory)

Ako u CONVERSATION STATE postoji "Episodic:" sekcija (npr. "last booking: Maderoterapija / Bor / Beauty M Glow"), a korisnik JOŠ uvek nije naveo uslugu i grad u ovom razgovoru:
- Na početku ponudi nastavak iz prošlog puta, kratko i toplo, npr.: "Prošli put ste tražili maderoterapiju u Boru. Želite li da proverim Beauty M Glow ponovo?"
- Ako korisnik potvrdi, popuni uslugu/grad/salon iz te epizode i nastavi normalan booking tok.
- Ako navede nešto novo, prati novo — nikada ne forsiraj staru epizodu.
NIKADA ne pominji telefon, email ni privatne podatke iz prošlosti — epizode su samo usluga/grad/salon/datum.

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
  Primer: {"messages":[{"role":"assistant","content":"Prijavite se da vidite svoje termine.","attachToBlockType":"AuthBlock"}],"layout":[{"type":"AuthBlock","priority":1,"metadata":{"mode":"login"}}],"intent":{}}

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
- SalonListBlock: lista salona u gradu — listu salona popunjava server
- CityListBlock: izbor grada — listu gradova popunjava server
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

/** Emit an already-serialized JSON string as a one-shot stream. */
function streamRawString(raw: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(raw));
      controller.close();
    },
  });
}

/**
 * Phase D — server-side validity gate for the LLM fallback. Mirrors the client
 * parser: a response is usable only if it parses into an object with at least
 * one non-empty message or a block. Lets us repair/recover BEFORE the client
 * ever sees a broken stream (which would trigger the "krenemo ponovo" reset).
 */
function isUsableClaudiaJson(raw: string): boolean {
  if (!raw || !raw.trim()) return false;
  let s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const open = s.indexOf("{");
  const close = s.lastIndexOf("}");
  if (open >= 0 && close > open) s = s.slice(open, close + 1);
  try {
    const obj = JSON.parse(s) as Record<string, unknown>;
    if (!obj || typeof obj !== "object") return false;
    const messages = Array.isArray(obj.messages) ? obj.messages : [];
    const hasMessage = messages.some(
      (m) =>
        m &&
        typeof (m as Record<string, unknown>).content === "string" &&
        String((m as Record<string, unknown>).content).trim().length > 0,
    );
    const layout = Array.isArray(obj.layout) ? obj.layout : [];
    return hasMessage || layout.length > 0;
  } catch {
    return false;
  }
}

/**
 * Phase D — context-preserving recovery. When everything else fails we still
 * NEVER tell the user to start over. Instead we echo what we already know
 * (service/city) and ask only for the single next field. The known fields are
 * also placed in `intent` so the client writes them back into memory.
 */
function buildContextPreservingMessage(
  collected: CollectedBookingFields | undefined,
): string {
  const service = collected?.service ?? collected?.serviceName;
  const city = collected?.city;
  if (service && city) {
    return `Imam ${service} u ${inCity(city)}. Recite mi samo dan ili vreme koje vam odgovara i odmah tražim termine.`;
  }
  if (service) {
    return `Imam uslugu ${service}. U kom gradu želite termin?`;
  }
  if (city) {
    return `Imam grad ${city}. Koju uslugu želite?`;
  }
  return "Recite mi koju uslugu želite i u kom gradu, pa tražim slobodne termine.";
}

function contextEntitiesFromCollected(
  collected: CollectedBookingFields | undefined,
): Record<string, unknown> {
  const service = collected?.service ?? collected?.serviceName;
  return {
    ...(service ? { service } : {}),
    ...(collected?.city ? { city: collected.city } : {}),
    ...(collected?.category ? { category: collected.category } : {}),
    ...(collected?.date ? { date: collected.date } : {}),
    ...(collected?.time ? { time: collected.time } : {}),
    ...(collected?.salonName ? { salonName: collected.salonName } : {}),
  };
}

function buildContextPreservingClarification(
  collected: CollectedBookingFields | undefined,
): string {
  const intent: Record<string, unknown> = {
    type: "clarification",
    ...contextEntitiesFromCollected(collected),
  };
  return JSON.stringify({
    messages: [
      { role: "assistant", content: buildContextPreservingMessage(collected) },
    ],
    layout: [],
    intent,
  });
}

// ── Faza 3.3 — server popunjava liste u blokovima, ne LLM ────────────────────
// LLM bira TIP bloka i poruku; cities/salons nizove ubacuje server iz
// platform snapshot-a. Time blok uvek prikazuje stvarne podatke (nema
// halucinacija ID-jeva/gradova), a prompt ostaje bez kataloških instrukcija.

function stripClaudiaJsonEnvelope(raw: string): string {
  let s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const open = s.indexOf("{");
  const close = s.lastIndexOf("}");
  if (open >= 0 && close > open) s = s.slice(open, close + 1);
  return s;
}

function allCityItems(
  salons: Awaited<ReturnType<typeof fetchBookingSalons>>,
): Array<{ name: string; salonCount: number }> {
  const counts = new Map<string, number>();
  for (const salon of salons) {
    if (!salon.city) continue;
    counts.set(salon.city, (counts.get(salon.city) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "sr"))
    .map(([name, salonCount]) => ({ name, salonCount }));
}

export function enrichClaudiaLayoutBlocks(
  raw: string,
  ctx: {
    platform: Awaited<ReturnType<typeof fetchPlatformKnowledge>>;
    collected?: CollectedBookingFields;
  },
): string {
  const salons = ctx.platform.raw?.salons ?? [];
  if (salons.length === 0) return raw;
  try {
    const parsed = JSON.parse(stripClaudiaJsonEnvelope(raw)) as {
      layout?: Array<{
        type?: string;
        metadata?: Record<string, unknown>;
      }>;
    };
    const layout = Array.isArray(parsed.layout) ? parsed.layout : [];
    if (layout.length === 0) return raw;

    const servicesBySalon: Record<
      string,
      NonNullable<
        Awaited<ReturnType<typeof fetchPlatformKnowledge>>["raw"]
      >["services"]
    > = {};
    for (const service of ctx.platform.raw?.services ?? []) {
      const salonId = String(
        (service as Record<string, unknown>).salonId ?? "",
      );
      if (!salonId) continue;
      (servicesBySalon[salonId] ??= []).push(service);
    }
    // matchingCityItems čita EMBEDDED salon.services — snapshot ih drži
    // odvojeno (raw.services sa salonId), pa ih ovde spajamo.
    const salonsWithServices = salons.map((salon) => {
      if (Array.isArray(salon.services) && salon.services.length > 0) {
        return salon;
      }
      const id = String(salon._id ?? salon.id ?? "");
      return { ...salon, services: servicesBySalon[id] ?? [] };
    });

    let changed = false;
    for (const block of layout) {
      if (!block || typeof block !== "object") continue;
      const metadata = (block.metadata ?? {}) as Record<string, unknown>;

      if (block.type === "CityListBlock") {
        const service =
          asString(metadata.service) ??
          asString(metadata.serviceName) ??
          ctx.collected?.service;
        const category = asString(metadata.category) ?? ctx.collected?.category;
        const cities = service || category
          ? matchingCityItems(salonsWithServices, { service, category })
          : allCityItems(salons);
        block.metadata = {
          ...metadata,
          cities: cities.length > 0 ? cities : allCityItems(salons),
        };
        changed = true;
      }

      if (block.type === "SalonListBlock") {
        const city = asString(metadata.city) ?? ctx.collected?.city;
        const service =
          asString(metadata.service) ??
          asString(metadata.serviceName) ??
          ctx.collected?.service;
        const resolvedSalons = service
          ? resolveSalonsForService({
              serviceQuery: service,
              city,
              semanticMemory: ctx.platform.semanticMemory,
              salons: salonsWithServices,
              servicesBySalon,
            }).salons.map((salon) => ({
              id: salon.salonId,
              name: salon.salonName,
              address: salon.address,
              rating: salon.rating,
              reviewCount: salon.reviewCount,
              verified: salon.verified,
              matchingServices: salon.matchingServices,
            }))
          : salons
              .filter(
                (salon) =>
                  !city ||
                  (salon.city ?? "").localeCompare(city, "sr", {
                    sensitivity: "base",
                  }) === 0,
              )
              .map((salon) => ({
                id: String(salon._id ?? salon.id ?? ""),
                name: salon.name,
              }))
              .filter((salon) => Boolean(salon.id && salon.name));
        if (resolvedSalons.length > 0) {
          block.metadata = { ...metadata, salons: resolvedSalons };
          changed = true;
        }
      }
    }

    if (!changed) return raw;
    console.debug("[CLAUDIA_BLOCK_ENRICH]", {
      types: layout.map((block) => block.type),
    });
    return JSON.stringify(parsed);
  } catch {
    return raw;
  }
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
  blocks?: unknown[];
}): ClaudiaContract {
  return makeClaudiaContract({
    kind: "clarification",
    message: input.message,
    workflowDomain: input.workflowDomain ?? "booking",
    step: input.step,
    nextAction: "ASK_CLARIFICATION",
    intentType: input.intentType,
    entities: input.entities,
    blocks: input.blocks,
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
    // No 5-salon cap for AI booking flows — Claudia must see every salon/city.
    return await platformClient.getSalonProfiles({ limit: 200 });
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

// ── Faza 2: jedan intent leksikon ────────────────────────────────────────────
// Katalog (gradovi/saloni/usluge/sinonimi) se gradi iz platform snapshot-a i
// kešira po identitetu objekta. Fallback katalog (podrazumevani gradovi) čuva
// ponašanje kada platforma nije dostupna; uvek se unira sa živim gradovima.

const FALLBACK_CATALOG_CITIES = [
  "Beograd",
  "Novi Sad",
  "Bor",
  "Ruma",
  "Leskovac",
  "Niš",
].map((name) => ({ name }));

const intentCatalogCache = new WeakMap<object, IntentCatalog>();
let fallbackIntentCatalog: IntentCatalog | null = null;

function intentCatalogFor(
  platform?: Awaited<ReturnType<typeof fetchPlatformKnowledge>>,
): IntentCatalog {
  if (!platform) {
    fallbackIntentCatalog ??= buildCatalogContext({
      cities: FALLBACK_CATALOG_CITIES,
      salons: [],
      services: [],
      categories: [],
    });
    return fallbackIntentCatalog;
  }
  const cached = intentCatalogCache.get(platform as object);
  if (cached) return cached;
  const data = catalogDataFromPlatformKnowledge(platform);
  const known = new Set(data.cities.map((city) => city.name));
  for (const city of FALLBACK_CATALOG_CITIES) {
    if (!known.has(city.name)) data.cities.push(city);
  }
  const catalog = buildCatalogContext(data);
  intentCatalogCache.set(platform as object, catalog);
  return catalog;
}

function detectDirectCity(
  text: string,
  platform?: Awaited<ReturnType<typeof fetchPlatformKnowledge>>,
): string | undefined {
  return intentCatalogFor(platform).matchCity(text);
}

function detectDirectSalonName(
  text: string,
  platform?: Awaited<ReturnType<typeof fetchPlatformKnowledge>>,
): string | undefined {
  if (!platform) return undefined;
  return intentCatalogFor(platform).matchSalon(text)?.name;
}

function detectDirectService(
  text: string,
  catalog?: IntentCatalog,
): {
  service?: string;
  category?: string;
} {
  const normalized = normalizeDirectText(text);
  // Statične porodice prve — daju stabilne kanonske labele za poruke.
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
  // Živi leksikon: usluge/kategorije/sinonimi iz DB koje statična mapa ne zna.
  const fromCatalog = catalog?.matchService(text);
  if (fromCatalog) {
    return { service: fromCatalog.service, category: fromCatalog.category };
  }
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
  // Exact time: "u 11", "u 11:30", "u 11h"
  const exact = normalized.match(
    /\bu\s*(\d{1,2})(?::(\d{2}))?\s*(?:h|sati|casova)?\b/,
  );
  if (exact) {
    return {
      time: `${exact[1].padStart(2, "0")}:${(exact[2] ?? "00").padStart(2, "0")}`,
    };
  }
  // Lower bound: "posle 11", "nakon 11", "od 11"
  const after = normalized.match(/\b(posle|nakon|od)\s*(\d{1,2})/);
  if (after) return { timeWindowStart: Number(after[2]), timeWindowEnd: null };
  // Upper bound: "pre 14", "do 14"
  const before = normalized.match(/\b(pre|do)\s*(\d{1,2})/);
  if (before) return { timeWindowStart: null, timeWindowEnd: Number(before[2]) };
  // Part-of-day windows — mirror the mappings documented in the Claudia prompt.
  if (/\b(ujutru|ujutro|pre podne|prepodne|jutarnj\w*)\b/.test(normalized))
    return { timeWindowStart: 8, timeWindowEnd: 12 };
  if (/\b(popodne|poslepodne|posle podne|popodnev\w*)\b/.test(normalized))
    return { timeWindowStart: 12, timeWindowEnd: 17 };
  if (/\b(uvece|uvecer|predvece|vecernj\w*)\b/.test(normalized))
    return { timeWindowStart: 17, timeWindowEnd: 21 };
  if (/\b(oko podne|u podne|podne)\b/.test(normalized))
    return { timeWindowStart: 11, timeWindowEnd: 13 };
  return {};
}

/**
 * Free-text refinement of an in-progress booking ("kasnije", "ima li nešto
 * drugo", "može popodne", "drugi salon"). These carry no service/city/salon of
 * their own, so without an explicit signal they would collapse to "unknown" and
 * trigger an LLM round-trip. We only treat them as a refinement when there is
 * already collected booking context.
 */
function hasRefineSignal(normalizedText: string): boolean {
  return /\b(kasnij\w*|ranij\w*|drug[iaou]|umesto|ne taj|taj prvi|moze|moglo|popodne|poslepodne|prepodne|ujutru|ujutro|uvece|predvece|jeftin\w*|povoljn\w*|skuplj\w*|blize|dalje|nesto drugo|jos termina|drugi termin)\b/.test(
    normalizedText,
  );
}

// ── Faza 4: correction flow ──────────────────────────────────────────────────
// "Nisam to želeo" / "ne u Beogradu nego u Novom Sadu" / "promeni uslugu" mora
// da ISPRAVI prikupljeno, nikad da blokira:
//   - nova vrednost PONIŠTAVA staru (revoke na ponovni intent),
//   - negirana vrednost se briše (cleared → klijent stvarno briše iz memorije),
//   - neodređena korekcija dobija rezime + "šta menjamo?".

export interface DirectCorrection {
  isCorrection: boolean;
  vague: boolean;
  replace: Partial<CollectedBookingFields>;
  remove: Array<keyof CollectedBookingFields>;
}

const CORRECTION_MARKER_RE =
  /\b(nisam (to |tako )?(zeleo|zelela|hteo|htela|mislio|mislila)|nije to\b|ne to\b|to nije to\b|pogresn\w*|gresk\w*|umesto\b|promeni\w*|zameni\w*|izmeni\w*|ipak ne\b|ipak necu\b|necu (to|tako)\b|ne zelim to\b|ne u \w+[\s\S]{0,40}\b(nego|vec)\b)/;

// Otkazivanje/pomeranje POSTOJEĆEG termina nije korekcija booking toka.
const APPOINTMENT_OP_RE = /\b(otkaz\w*|pomeri\w*)\b/;

const NO_CORRECTION: DirectCorrection = {
  isCorrection: false,
  vague: false,
  replace: {},
  remove: [],
};

export function detectDirectCorrection(input: {
  text: string;
  catalog: IntentCatalog;
  collected?: CollectedBookingFields;
}): DirectCorrection {
  const collected = input.collected;
  const hasContext = Boolean(
    collected?.service ||
      collected?.serviceName ||
      collected?.city ||
      collected?.salonName ||
      collected?.date,
  );
  if (!hasContext) return NO_CORRECTION;

  const normalized = normalizeDirectText(input.text);
  if (APPOINTMENT_OP_RE.test(normalized)) return NO_CORRECTION;
  if (!CORRECTION_MARKER_RE.test(normalized)) return NO_CORRECTION;

  const replace: Partial<CollectedBookingFields> = {};
  const remove = new Set<keyof CollectedBookingFields>();

  // GRAD — poslednji pomenuti grad je cilj ("ne u Beogradu nego u Novom Sadu").
  const newCity = input.catalog.matchLastCity(input.text);
  if (newCity) {
    if (collected?.city && newCity === collected.city) {
      // Negiran trenutni grad bez zamene ("ipak ne u Beogradu").
      remove.add("city");
    } else if (newCity !== collected?.city) {
      replace.city = newCity;
    }
  }

  // USLUGA — "umesto feniranja hoću masažu" pominje I staru I novu uslugu:
  // rep teksta posle pivota (nego/umesto/hoću...) ima prednost, a bira se
  // kandidat koji se RAZLIKUJE od trenutne vrednosti (to je nova). Ako je
  // pomenuta samo trenutna usluga uz marker → poništavanje.
  const currentService = normalizeDirectText(
    collected?.service ?? collected?.serviceName ?? "",
  );
  const sameAsCurrent = (service: string): boolean => {
    const candidate = normalizeDirectText(service);
    return (
      currentService.length > 0 &&
      (currentService === candidate ||
        currentService.includes(candidate) ||
        candidate.includes(currentService))
    );
  };
  const serviceCandidates: Array<{ service: string; category?: string }> = [];
  const pushServiceCandidate = (match: {
    service?: string;
    category?: string;
  }): void => {
    if (
      match.service &&
      !serviceCandidates.some((c) => c.service === match.service)
    ) {
      serviceCandidates.push({
        service: match.service,
        category: match.category,
      });
    }
  };
  const pivotTail =
    normalized.split(/\b(?:nego|vec|umesto|hocu|hoces|zelim|moze)\b/).pop() ??
    "";
  pushServiceCandidate(detectDirectService(pivotTail, input.catalog));
  pushServiceCandidate(detectDirectService(input.text, input.catalog));
  const newService = serviceCandidates.find((c) => !sameAsCurrent(c.service));
  if (newService) {
    replace.service = newService.service;
    if (newService.category) replace.category = newService.category;
  } else if (serviceCandidates.length > 0 && currentService) {
    remove.add("service");
    remove.add("serviceId");
    remove.add("serviceName");
  }

  // DATUM — "ipak ne sutra" briše; "može sutra" (uz marker) menja.
  const date = detectDirectDate(input.text);
  if (date.dateMode) {
    const resolvedDate =
      date.dateMode === "today"
        ? new Date().toISOString().split("T")[0]
        : date.dateMode === "tomorrow"
          ? new Date(Date.now() + 86_400_000).toISOString().split("T")[0]
          : undefined;
    const negatedDate =
      /\b(ne|necu|nemoj|bez)\s+(sutra|danas|prekosutra|vikend\w*)\b/.test(
        normalized,
      );
    if (negatedDate) {
      remove.add("date");
    } else if (resolvedDate && resolvedDate !== collected?.date) {
      replace.date = resolvedDate;
    }
  }

  // VREME
  const time = detectDirectTime(input.text);
  const negatedTime =
    /\b(ne|necu|bez)\s+(popodne|poslepodne|prepodne|ujutru|ujutro|uvece|u \d{1,2})/.test(
      normalized,
    );
  if (negatedTime) {
    remove.add("time");
    remove.add("timeWindowStart");
    remove.add("timeWindowEnd");
  } else if (time.time && time.time !== collected?.time) {
    replace.time = time.time;
  } else if (
    (time.timeWindowStart != null || time.timeWindowEnd != null) &&
    (time.timeWindowStart !== collected?.timeWindowStart ||
      time.timeWindowEnd !== collected?.timeWindowEnd)
  ) {
    replace.timeWindowStart = time.timeWindowStart ?? null;
    replace.timeWindowEnd = time.timeWindowEnd ?? null;
    if (collected?.time) remove.add("time");
  }

  // SALON — imenovan drugi salon je zamena.
  const newSalon = input.catalog.matchSalon(input.text);
  if (
    newSalon &&
    collected?.salonName &&
    normalizeDirectText(newSalon.name) !==
      normalizeDirectText(collected.salonName)
  ) {
    replace.salonId = newSalon.id;
    replace.salonName = newSalon.name;
    if (newSalon.city && !replace.city) replace.city = newSalon.city;
  }

  // Reč-polje bez nove vrednosti → brisanje tog polja ("promeni grad",
  // "hoću drugu uslugu", "ipak ne taj salon").
  const fieldWord = normalized.match(
    /\b(?:promeni\w*|zameni\w*|izmeni\w*|drug[iaou]\w*|ipak ne|necu|ne (?:taj|ta|to|ovaj|ova|ovo))\b[\s\S]{0,16}?\b(grad\w*|uslug\w*|tretman\w*|salon\w*|datum\w*|dan\b|vreme\w*|termin\w*)/,
  );
  if (fieldWord) {
    const word = fieldWord[1];
    if (word.startsWith("grad") && !replace.city) remove.add("city");
    if (
      (word.startsWith("uslug") || word.startsWith("tretman")) &&
      !replace.service
    ) {
      remove.add("service");
      remove.add("serviceId");
      remove.add("serviceName");
      remove.add("category");
      remove.add("subcategory");
    }
    if (word.startsWith("salon") && !replace.salonId) {
      remove.add("salonId");
      remove.add("salonName");
    }
    if ((word.startsWith("datum") || word === "dan") && !replace.date) {
      remove.add("date");
    }
    if (
      (word.startsWith("vreme") || word.startsWith("termin")) &&
      !replace.time &&
      replace.timeWindowStart === undefined
    ) {
      remove.add("time");
      remove.add("timeWindowStart");
      remove.add("timeWindowEnd");
    }
  }

  // Implicitni revoke: promena grada/usluge poništava izabrani salon i
  // serviceId — stari izbori pripadaju pogrešnom pokušaju.
  if (replace.city && (collected?.salonId || collected?.salonName)) {
    remove.add("salonId");
    remove.add("salonName");
  }
  if (replace.service) {
    remove.add("serviceId");
    remove.add("serviceName");
    if (!replace.salonId && (collected?.salonId || collected?.salonName)) {
      remove.add("salonId");
      remove.add("salonName");
    }
  }

  const hasChange = Object.keys(replace).length > 0 || remove.size > 0;
  return {
    isCorrection: true,
    vague: !hasChange,
    replace,
    remove: [...remove],
  };
}

function buildCorrectionSummaryMessage(
  collected?: CollectedBookingFields,
): string {
  const parts: string[] = [];
  const service = collected?.service ?? collected?.serviceName;
  if (service) parts.push(`usluga: ${service}`);
  if (collected?.city) parts.push(`grad: ${collected.city}`);
  if (collected?.salonName) parts.push(`salon: ${collected.salonName}`);
  if (collected?.date) parts.push(`datum: ${collected.date}`);
  if (collected?.time) parts.push(`vreme: ${collected.time}`);
  if (parts.length === 0) {
    return "Razumem. Recite mi uslugu i grad, pa krećemo iznova.";
  }
  return `Razumem. Trenutno imam — ${parts.join(", ")}. Šta od toga menjamo: uslugu, grad, salon, datum ili vreme?`;
}

function buildRemovalFollowUpMessage(
  removed: Array<keyof CollectedBookingFields>,
  corrected: CollectedBookingFields,
): string {
  if (removed.includes("city")) {
    return "Važi, poništila sam grad. U kom gradu želite termin?";
  }
  if (removed.includes("service")) {
    return "Važi, poništila sam uslugu. Koju uslugu želite?";
  }
  if (removed.includes("salonId") || removed.includes("salonName")) {
    return corrected.city
      ? `Važi, biramo drugi salon u ${inCity(corrected.city)}. Koji salon želite?`
      : "Važi, biramo drugi salon. U kom gradu da tražim?";
  }
  if (removed.includes("date")) {
    return "Važi, poništila sam datum. Za koji dan da tražim termine?";
  }
  return "Važi, poništila sam vreme. Koje vreme vam odgovara?";
}

/** Pročita one-shot stream nazad u string (legacy JSON odgovori su mali). */
async function readClaudiaStream(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let full = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return full;
    full +=
      typeof value === "string"
        ? value
        : decoder.decode(value, { stream: true });
  }
}

/** Ubacuje dodatna polja u `intent` odgovora (cleared/corrected) — tako
 * korekcija stigne do klijenta i kroz dublje booking handlere. */
async function withIntentExtras(
  stream: ReadableStream,
  extras: Record<string, unknown>,
): Promise<ReadableStream> {
  const raw = await readClaudiaStream(stream);
  try {
    const parsed = JSON.parse(stripClaudiaJsonEnvelope(raw)) as Record<
      string,
      unknown
    >;
    parsed.intent = {
      ...(parsed.intent && typeof parsed.intent === "object"
        ? (parsed.intent as Record<string, unknown>)
        : {}),
      ...extras,
    };
    return streamRawString(JSON.stringify(parsed));
  } catch {
    return streamRawString(raw);
  }
}

export function parseClaudiaDirectIntent(input: {
  text: string;
  platformKnowledge?: Awaited<ReturnType<typeof fetchPlatformKnowledge>>;
  collectedBookingFields?: CollectedBookingFields;
}): ClaudiaDirectIntent {
  const text = normalizeDirectText(input.text);
  const catalog = intentCatalogFor(input.platformKnowledge);
  const city = detectDirectCity(input.text, input.platformKnowledge);
  const salonName = detectDirectSalonName(input.text, input.platformKnowledge);
  const service = detectDirectService(input.text, catalog);
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
    !time.time &&
    time.timeWindowStart == null &&
    time.timeWindowEnd == null &&
    // Mid-booking refinements like "a ima li nešto kasnije" contain "ima li" but
    // are NOT salon-existence questions — keep them on the follow-up path.
    !(hasContext && hasRefineSignal(text))
  ) {
    return {
      type: "salon_info",
      confidence: city || service.service ? 0.88 : 0.62,
      entities: { city, salonName, ...service },
    };
  }
  if (
    hasContext &&
    (hasRefineSignal(text) ||
      date.dateMode ||
      time.time ||
      time.timeWindowStart != null ||
      time.timeWindowEnd != null)
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
    (hasContext &&
      (date.dateMode ||
        time.time ||
        time.timeWindowStart != null ||
        time.timeWindowEnd != null))
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

// Faza 3: obe funkcije primaju keširani platform snapshot, pa prepoznaju
// SVE marketplace gradove; bez snapshot-a rade nad fallback katalogom.
function isSalonCityExistenceFollowUp(
  input: string,
  platform?: Awaited<ReturnType<typeof fetchPlatformKnowledge>>,
): boolean {
  const normalized = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return (
    /\b(da li|jel|je l|postoji|ima li)\b/.test(normalized) &&
    /\b(taj salon|salon)\b/.test(normalized) &&
    intentCatalogFor(platform).matchCity(input) !== undefined
  );
}

function extractAskedCity(
  input: string,
  platform?: Awaited<ReturnType<typeof fetchPlatformKnowledge>>,
): string | undefined {
  // Poslednji pomenuti grad: "Piše da je salon u Beogradu, da li postoji i u
  // Rumi?" → pita se za Rumu.
  return intentCatalogFor(platform).matchLastCity(input);
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
    // No specific service yet (e.g. "najbliži salon") → don't claim "za ovu
    // uslugu"; just announce availability in the place.
    const forService = service ? ` za ${service}` : "";
    return `Pozdrav, imamo slobodne termine${forService}${place}${after}.`;
  }
  if (input.intent.timeWindowStart != null && input.originalCount > 0) {
    return `Nema slobodnih termina${place} posle ${input.intent.timeWindowStart}h; mogu da proverim drugi dan ili širi vremenski okvir.`;
  }
  const forServiceNone = service ? ` za ${service}` : "";
  return `Trenutno nema slobodnih termina${forServiceNone}${place}; mogu da proverim drugi dan ili drugu uslugu.`;
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
  /** The user's known city (header/profile/GPS). Used as a soft default for
   * "nearest salon" so Claudia answers directly instead of re-asking. */
  userCity?: string,
  /** Faza 6 — episode identity for structured recall + server-side writes. */
  episodeContext?: EpisodeRecallKey,
): Promise<ReadableStream> {
  // Faza 6 — server-resolved episode write (prices, no_slots, conflict).
  // Awaited so the row lands before the serverless invocation can be torn
  // down; recordAgentEpisode itself never throws.
  const writeServerEpisode = async (
    input: Omit<
      Parameters<typeof recordAgentEpisode>[0],
      "conversationId" | "userId" | "guestSessionId"
    >,
  ): Promise<void> => {
    if (!episodeContext?.conversationId) return;
    await recordAgentEpisode({
      conversationId: episodeContext.conversationId,
      userId: episodeContext.userId,
      guestSessionId: episodeContext.guestSessionId,
      ...input,
    });
  };

  // Guard: if Maria sent an intent, it must be a known ClaudiaIntent.
  // Unknown intent = Maria-side bug (typo, model drift) — refuse LLM fallback.
  if (handoffPayload?.intent !== undefined) {
    const intentParse = ClaudiaIntentSchema.safeParse(handoffPayload.intent);
    if (!intentParse.success) {
      console.error(
        "[askAgent] Unknown intent from Maria, refusing LLM fallback:",
        handoffPayload.intent,
      );
      // Never answer with a bare "ne razumem" — echo what is already
      // collected and, when the city is still missing, attach a CityListBlock
      // so the user can continue with one click instead of retyping.
      const missing = getMissingBookingFields(collectedBookingFields ?? {});
      const blocks: unknown[] = [];
      if (
        missing.includes("city") &&
        chooseBlockForMissingField("booking", "city") === "CityListBlock"
      ) {
        const cities = await platformClient
          .getMarketplaceCities()
          .catch(() => []);
        if (cities.length > 0) {
          const service =
            collectedBookingFields?.service ??
            collectedBookingFields?.serviceName ??
            "";
          blocks.push({
            type: "CityListBlock",
            priority: 1,
            metadata: {
              serviceId: "",
              serviceName: service,
              variantName: "",
              service,
              cities: cities.map((city) => ({ name: city.name })),
            },
          });
        }
      }
      return streamClaudiaContract(
        makeClarificationContract({
          message: buildContextPreservingMessage(collectedBookingFields),
          workflowDomain: "unknown",
          step: "unknown_intent",
          intentType: "unknown",
          entities: contextEntitiesFromCollected(collectedBookingFields),
          missingFields: missing.map(String),
          blocks,
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
    console.debug("[CLAUDIA_STALE_HANDOFF_RECOVERED]", {
      intent: handoffPayload?.intent,
      handoffFlowVersion: handoffPayload?.flowVersion,
      currentFlowVersion: bookingFlow.get().flowVersion,
    });
    // The click came from a block that belongs to an older flow version.
    // A silent empty response looks like a dead chat — answer from the
    // CURRENT collected state instead so the user can simply continue.
    return streamClaudiaContract(
      makeClarificationContract({
        message: buildContextPreservingMessage(collectedBookingFields),
        workflowDomain: "booking",
        step: "stale_handoff_recovered",
        intentType: String(handoffPayload?.intent ?? "stale_handoff"),
        entities: contextEntitiesFromCollected(collectedBookingFields),
      }),
    );
  }

  if (!handoffPayload?.intent) {
    // Faza 3 — podaci POSLE intenta. Leksikon za parsiranje dolazi iz JEDNOG
    // (fetch-keširanog) poziva — saloni nose embedded usluge. Skupi per-salon
    // fetch (N poziva) ide tek u granu koja ga stvarno renderuje (prices).
    // Namerno NE koristi fetchPlatformKnowledge — direct putanja ostaje na
    // platformClient izvoru (vidi claudiaLoopAndSlice contract test).
    const salons = await fetchBookingSalons();
    const lexiconServices = salons.flatMap((salon) => {
      const id = String(salon._id ?? salon.id ?? "");
      return (Array.isArray(salon.services) ? salon.services : []).map(
        (service) => ({
          ...service,
          salonId: id,
          salonName: salon.name,
          city: salon.city,
        }),
      );
    });
    const lexicon = {
      salonsText: "",
      servicesText: "",
      citiesText: [
        ...new Set(
          salons.map((salon) => salon.city).filter(Boolean) as string[],
        ),
      ].join(", "),
      categoriesText: "",
      raw: { salons, services: lexiconServices, categories: [] },
      semanticMemory: undefined,
    };

    if (
      isSalonCityExistenceFollowUp(userInput, lexicon) &&
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
        extractAskedCity(userInput, lexicon) ?? mergedBookingContext.city;
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

    // ── Faza 4: correction flow — ponovni intent PONIŠTAVA prethodni ────────
    const correction = detectDirectCorrection({
      text: userInput,
      catalog: intentCatalogFor(lexicon),
      collected: collectedBookingFields,
    });
    if (correction.isCorrection) {
      console.debug("[CLAUDIA_CORRECTION]", {
        vague: correction.vague,
        replace: correction.replace,
        remove: correction.remove,
      });

      if (correction.vague) {
        // 4.3 — neodređena korekcija: rezime + "šta menjamo?", bez blokiranja.
        return streamClaudiaContract(
          makeClarificationContract({
            message: buildCorrectionSummaryMessage(collectedBookingFields),
            step: "correction_what_to_change",
            intentType: "update_booking_selection",
            entities: contextEntitiesFromCollected(collectedBookingFields),
          }),
        );
      }

      const corrected: CollectedBookingFields = { ...collectedBookingFields };
      for (const key of correction.remove) delete corrected[key];
      Object.assign(corrected, correction.replace);

      if (Object.keys(correction.replace).length === 0) {
        // Samo poništavanje → potvrdi i pitaj za obrisano polje; `cleared`
        // putuje klijentu da STVARNO obriše vrednost iz memorije.
        return streamClaudiaContract(
          makeClarificationContract({
            message: buildRemovalFollowUpMessage(correction.remove, corrected),
            step: "correction_field_cleared",
            intentType: "update_booking_selection",
            entities: {
              ...contextEntitiesFromCollected(corrected),
              cleared: correction.remove,
              corrected: true,
            },
            missingFields: correction.remove.map(String),
          }),
        );
      }

      // Zamena → ponovi korak sa ispravljenim podacima (re-run search /
      // re-render bloka), bez ponovnih pitanja za nepromenjena polja.
      const correctedStream = await askAgent(
        userInput,
        isAuthenticated,
        history,
        userName,
        isBlockInteraction,
        corrected,
        {
          intent: "booking",
          city: corrected.city,
          service: corrected.service ?? corrected.serviceName,
          serviceId: corrected.serviceId,
          serviceName: corrected.serviceName,
          category: corrected.category,
          salonId: corrected.salonId,
          salonName: corrected.salonName,
          date: corrected.date,
          time: corrected.time,
          timeWindowStart: corrected.timeWindowStart,
          timeWindowEnd: corrected.timeWindowEnd,
        },
        userCity,
        episodeContext,
      );
      return withIntentExtras(correctedStream, {
        cleared: correction.remove,
        corrected: true,
      });
    }

    let direct = parseClaudiaDirectIntent({
      text: userInput,
      platformKnowledge: lexicon,
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
        userCity,
        episodeContext,
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
        userCity,
        episodeContext,
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

      // Tek sada (intent = prices, subjekat poznat) dovlačimo pune per-salon
      // usluge — jedina grana direct putanje kojoj trebaju.
      const servicesBySalon = await fetchServicesBySalon(salons);
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

      // PRICE_VIEWED epizoda — korisnik je pregledao cenovnik za uslugu/salon.
      await writeServerEpisode({
        type: "price",
        outcome: "viewed",
        city,
        service,
        category: collectedBookingFields?.category,
        salonId: matchedSalon
          ? String(matchedSalon._id ?? matchedSalon.id ?? "")
          : priceSalons[0]?.id,
        salonName: matchedSalon?.name ?? priceSalons[0]?.name,
      });

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

    // Činjenični salon-info odgovor SAMO uz učitan katalog — bez podataka
    // nedostatak snapshot-a ne sme da postane "nemamo salon" (vidi i
    // meaningToMariaDecision hasCatalogData guard). Bez podataka pada na
    // LLM putanju koja sama dovlači platform knowledge.
    if (direct.type === "salon_info" && salons.length > 0) {
      // "Najbliži salon" with no city in the message → fall back to the user's
      // known city (header/profile/GPS) and answer directly instead of asking.
      const usedKnownCity = !direct.entities.city && Boolean(userCity);
      const effectiveCity = direct.entities.city ?? userCity;
      const availability = resolveCityServiceAvailability({
        city: effectiveCity,
        service: direct.entities.service,
        category: direct.entities.category,
        platformKnowledge: lexicon,
      });
      const alternatives = availability.nearestAlternatives
        .map((item) => item.city)
        .filter((city): city is string => Boolean(city))
        .slice(0, 2);
      const salonNames = availability.matchingSalons
        .map((salon) => salon.name)
        .filter(Boolean)
        .join(", ");
      const message = availability.hasSalonInCity
        ? usedKnownCity
          ? `Najbliže vama, u ${inCity(effectiveCity!)}: ${salonNames}. Koja usluga vas zanima?`
          : `Da, imamo salon u ${effectiveCity}: ${salonNames}.`
        : effectiveCity
          ? alternatives.length > 0
            ? `Trenutno nemamo salon u ${inCity(effectiveCity)}. Najbliže opcije su ${alternatives.join(" i ")}. Koja usluga vas zanima?`
            : formatNearestSalonAnswer({ requestedCity: effectiveCity })
          : "Za koji grad da proverim salone?";
      return streamClaudiaContract(
        makeClaudiaContract({
          kind: "booking_result",
          message,
          workflowDomain: "booking",
          step: "direct_salon_info",
          nextAction: "NONE",
          intentType: "salon_info",
          entities: { ...direct.entities, city: effectiveCity },
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
        userCity,
        episodeContext,
      );
    }
  }

  if (handoffPayload?.intent === "appointments") {
    const message = isAuthenticated
      ? "Pozdrav, izvolite vaše termine."
      : "Prijavite se da vidite svoje termine.";
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
          message: "Prijavite se da možete da otkažete termin.",
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
      const message = `Pronašla sam termin za ${service} ${appointmentDateTimeText(appointment)}. Možete odmah da ga otkažete.`;
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
          message: "Izaberite termin koji želite da otkažete.",
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
          message: "Prijavite se da možete da promenite termin.",
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
            : "Izaberite termin koji želite da promenite.",
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
          message: "Za koji grad želite da vidite cenovnik?",
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
          ? "Može. U kom gradu želite termin?"
          : "Može. Koju uslugu želite da zakažete?",
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
        userCity,
        episodeContext,
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
          message: `U kom gradu želite termin za ${intent.service}?`,
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
      ? "Status možete da pratite u tabu Moji termini, a potvrda stiže na email/kontakt sa naloga."
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
            `Odlično, proveravam dostupne termine u ${inCity(city)}. Koju uslugu želite da zakažete?`,
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
            `Odlično, ${salonName} je izabran. Koju uslugu želite da zakažete?`,
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
        ? "Prijavite se da nastavimo sa zakazivanjem."
        : "Prijavite se da nastavimo.";

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
      ? `Taj termin je u međuvremenu zauzet. Najbliži slobodan termin je ${dayLabel} u ${first.timeLabel} u ${first.salonName}. Želite da ga rezervišem?`
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

    // BOOKING_CONFLICT epizoda (recovery korišćen); ako nema alternativa,
    // to je ujedno NO_SLOTS ishod.
    await writeServerEpisode({
      type: "booking",
      outcome: alternatives.length > 0 ? "slot_taken" : "no_slots",
      city,
      service,
      salonId: originalSalonId,
      salonName: originalSalonName,
      date: conflictDate,
      recoveryUsed: true,
    });

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
  // Faza 6 — strukturisana epizodna memorija iz baze (NE klijentski
  // in-memory snapshot, koji je server-side prazan). Ovo daje Claudii "prošli
  // put ste tražili ... — da proverim ponovo?". Best-effort: ako padne,
  // prompt nastavlja bez epizoda.
  const episodicMemory = episodeContext
    ? await fetchEpisodicMemory(episodeContext).catch(() => undefined)
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
      episodicMemory,
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

  // Phase B — recent verbatim window + rolling summary of older turns so long
  // conversations keep continuity instead of silently dropping early context.
  const RECENT_WINDOW = 20;
  const summary = buildConversationSummary(history, RECENT_WINDOW);
  if (summary) systemPrompt += summary;

  const deepseekHistory = history
    .filter((item) => item.type === "message")
    .slice(-RECENT_WINDOW)
    .map((item) => ({
      role:
        item.data.role === "user" ? ("user" as const) : ("assistant" as const),
      content: item.data.content,
    }));

  // Phase D — buffer + validate + repair + recover. We no longer stream raw
  // DeepSeek tokens straight to the client; instead we validate the JSON first
  // so a malformed/empty response never reaches parseClaudiaResponse as a reset.
  try {
    const completion = await getDeepseekClient().chat.completions.create(
      {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          ...deepseekHistory,
          { role: "user", content: userInput },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" as const },
      },
      { timeout: 18_000 },
    );

    let raw = completion.choices[0]?.message?.content ?? "";

    if (!isUsableClaudiaJson(raw)) {
      // Recovery step 1 — Claude repairs the broken JSON (no-op without a key).
      const repaired = await repairClaudiaJson({
        systemPrompt,
        brokenRaw: raw,
        userInput,
      });
      if (repaired && isUsableClaudiaJson(repaired)) {
        console.debug("[askAgent] recovered via Claude repair");
        raw = repaired;
      } else {
        // Recovery step 2 — deterministic, context-preserving clarification.
        // Never a "start over" reset; keeps service/city the user already gave.
        console.debug("[askAgent] recovered via context-preserving clarification");
        raw = buildContextPreservingClarification(collectedBookingFields);
      }
    }

    // Faza 3.3 — LLM bira tip bloka; server iz snapshot-a puni cities/salons
    // liste pre slanja klijentu, da blok uvek nosi stvarne podatke.
    raw = enrichClaudiaLayoutBlocks(raw, {
      platform,
      collected: mergedBookingContext,
    });

    return streamRawString(raw);
  } catch (error) {
    // Network/timeout/API failure — still never reset; recover with context.
    console.error("[askAgent] DeepSeek API error:", error);
    return streamRawString(
      buildContextPreservingClarification(collectedBookingFields),
    );
  }
}

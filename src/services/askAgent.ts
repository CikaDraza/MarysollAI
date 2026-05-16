// src/services/askAgent.ts
import { ThreadItem } from "@/types/ai/chat-thread";
import OpenAI from "openai";
import { ClaudiaIntentSchema } from "@/lib/ai/schemas/claudia.schema";
import { fetchPlatformKnowledge } from "@/lib/ai/platform-knowledge";
import type { CollectedBookingFields } from "@/lib/ai/booking-flow-state";
import type { AiBookingContact } from "@/types/aiBooking";
import { runBookingSearch } from "@/lib/search/runBookingSearch";
import type { StructuredBookingIntent } from "@/types/intent";
import type { SearchApiResponse, SearchResult } from "@/types/slots";

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
    "cities": [ { "name": "Beograd" }, { "name": "Novi Sad" } ]
  }
  ⚠ Popuni "cities" iz GRADOVI sekcije. Svaki element MORA imati polje "name".

SalonListBlock:
  metadata: {
    "city": "naziv grada",
    "service": "naziv usluge",
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
Ako imaš i grad i uslugu → odmah AppointmentCalendarBlock
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

const ACTIVE_APPOINTMENT_STATUSES = new Set([
  "pending",
  "appointment_approved",
  "appointment_rescheduled",
]);

function readActiveAppointments(payload: Record<string, unknown> | undefined) {
  const raw = [
    ...(Array.isArray(payload?.appointments) ? payload.appointments : []),
    ...(payload?.appointment && typeof payload.appointment === "object"
      ? [payload.appointment]
      : []),
  ];
  return raw
    .filter((appointment): appointment is Record<string, unknown> =>
      Boolean(appointment && typeof appointment === "object"),
    )
    .filter((appointment) =>
      ACTIVE_APPOINTMENT_STATUSES.has(String(appointment.status)),
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
      return streamJson({
        messages: [{ role: "assistant", content: "Ne razumem zahtev. Pokušajte ponovo." }],
        layout: [],
        intent: {},
      });
    }
  }

  if (handoffPayload?.intent === "appointments") {
    return streamJson({
      messages: [
        {
          role: "assistant",
          content: isAuthenticated
            ? "Pozdrav, izvolite vaše termine."
            : "Prijavi se da vidiš svoje termine.",
          attachToBlockType: isAuthenticated ? "CalendarBlock" : "AuthBlock",
        },
      ],
      layout: [
        isAuthenticated
          ? {
              type: "CalendarBlock",
              priority: 1,
              metadata: {
                mode: "list",
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
      ],
      intent: { type: "appointments" },
    });
  }

  if (handoffPayload?.intent === "cancel_appointment") {
    const activeAppointments = readActiveAppointments(handoffPayload);
    if (!isAuthenticated) {
      return streamJson({
        messages: [
          {
            role: "assistant",
            content: "Prijavi se da možeš da otkažeš termin.",
            attachToBlockType: "AuthBlock",
          },
        ],
        layout: [
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
        intent: { type: "cancel_appointment" },
      });
    }
    if (activeAppointments.length === 1) {
      const appointment = activeAppointments[0];
      const service = String(appointment.serviceName ?? "termin");
      return streamJson({
        messages: [
          {
            role: "assistant",
            content: `Pronašla sam termin za ${service} ${appointmentDateTimeText(appointment)}. Da li želite da ga otkažem?`,
            attachToBlockType: "none",
          },
        ],
        layout: [],
        intent: {
          type: "confirm_cancel_appointment",
          appointmentId: appointment._id,
        },
      });
    }
    if (activeAppointments.length > 1 || !handoffPayload?.appointments) {
      return streamJson({
        messages: [
          {
            role: "assistant",
            content: "Izaberi termin koji želiš da otkažeš.",
            attachToBlockType: "CalendarBlock",
          },
        ],
        layout: [
          {
            type: "CalendarBlock",
            priority: 1,
            metadata: {
              mode: "list",
              intent: "cancel_appointment",
              serviceId: "",
              serviceName: "",
              variantName: "",
            },
          },
        ],
        intent: { type: "cancel_appointment" },
      });
    }
    return streamJson({
      messages: [
        {
          role: "assistant",
          content: "Nemate aktivnih termina za otkazivanje.",
        },
      ],
      layout: [],
      intent: { type: "cancel_appointment" },
    });
  }

  if (handoffPayload?.intent === "update_appointment") {
    const activeAppointments = readActiveAppointments(handoffPayload);
    if (!isAuthenticated) {
      return streamJson({
        messages: [
          {
            role: "assistant",
            content: "Prijavi se da možeš da promeniš termin.",
            attachToBlockType: "AuthBlock",
          },
        ],
        layout: [
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
        intent: { type: "update_appointment" },
      });
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
        return streamJson({
          messages: [
            {
              role: "assistant",
              content:
                alternatives.length > 0
                  ? "Pronašla sam nekoliko slobodnih alternativa za isti termin."
                  : "Trenutno ne vidim slobodne alternative za taj termin.",
              attachToBlockType:
                alternatives.length > 0 ? "AppointmentCalendarBlock" : "none",
            },
          ],
          layout:
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
              : [],
          intent: {
            type: "confirm_update_appointment",
            appointmentId: appointment._id,
          },
        });
      }
    }

    return streamJson({
      messages: [
        {
          role: "assistant",
          content:
            activeAppointments.length === 1
              ? "Proveravam najbliže slobodne alternative za isti termin."
              : "Izaberi termin koji želiš da promeniš.",
          attachToBlockType: "CalendarBlock",
        },
      ],
      layout: [
        {
          type: "CalendarBlock",
          priority: 1,
          metadata: {
            mode: "list",
            intent: "update_appointment",
            serviceId: "",
            serviceName: "",
            variantName: "",
          },
        },
      ],
      intent: { type: "update_appointment" },
    });
  }

  if (handoffPayload?.intent === "prices") {
    const city = asString(handoffPayload.city) ?? collectedBookingFields?.city;
    if (!city) {
      return streamJson({
        messages: [
          {
            role: "assistant",
            content: "Za koji grad želiš da vidiš cenovnik?",
            attachToBlockType: "CityListBlock",
          },
        ],
        layout: [
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
        intent: { type: "prices" },
      });
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

    return streamJson({
      messages: [
        {
          role: "assistant",
          content: "Izaberi salon za ovaj termin.",
          attachToBlockType: "SalonListBlock",
        },
      ],
      layout: [
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
      intent: { type: "recover_missing_salon", city, service },
    });
  }

  if (handoffPayload?.intent === "booking") {
    const intent = buildIntentFromHandoff(handoffPayload, collectedBookingFields);
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

    return streamJson({
      messages: [
        {
          role: "assistant",
          content: message,
          attachToBlockType: slots.length > 0 ? "AppointmentCalendarBlock" : "none",
        },
      ],
      layout:
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
          : [],
      intent: {
        ...intent,
        type: "booking",
      },
    });
  }

  if (handoffPayload?.intent === "select_city") {
    const city = String(handoffPayload.city ?? "");
    const service = String(handoffPayload.service ?? collectedBookingFields?.service ?? "");
    const date = collectedBookingFields?.date ?? "";
    const time = collectedBookingFields?.time ?? "";

    if (!service) {
      return streamJson({
        messages: [
          {
            role: "assistant",
            content: `Izabrala si ${city}. Koju uslugu želiš da zakažeš?`,
          },
        ],
        layout: [],
        intent: { type: "select_city", city },
      });
    }

    return streamJson({
      messages: [
        {
          role: "assistant",
          content: time
            ? `Super, tražim ${service} u ${city} oko ${time}.`
            : `Super, tražim ${service} u ${city}.`,
          attachToBlockType: "AppointmentCalendarBlock",
        },
      ],
      layout: [buildAppointmentBlock({ service, city, date, time })],
      intent: { type: "select_city", city, service },
    });
  }

  if (handoffPayload?.intent === "select_salon") {
    const city = String(handoffPayload.city ?? collectedBookingFields?.city ?? "");
    const service = String(handoffPayload.service ?? collectedBookingFields?.service ?? "");
    const salonId = String(handoffPayload.salonId ?? "");
    const salonName = String(handoffPayload.salonName ?? "");
    const date = collectedBookingFields?.date ?? "";
    const time = collectedBookingFields?.time ?? "";

    if (!service) {
      return streamJson({
        messages: [
          {
            role: "assistant",
            content: `Izabrala si ${salonName}. Koju uslugu želiš da zakažeš?`,
          },
        ],
        layout: [],
        intent: { type: "select_salon", city, salonId, salonName },
      });
    }

    return streamJson({
      messages: [
        {
          role: "assistant",
          content: time
            ? `Izabrala si ${salonName}. Nastavljamo sa ${service} u ${time}.`
            : `Izabrala si ${salonName}. Nastavljamo sa ${service}.`,
          attachToBlockType: "AppointmentCalendarBlock",
        },
      ],
      layout: [
        buildAppointmentBlock({
          service,
          city,
          date,
          time,
          salonId,
          salonName,
        }),
      ],
      intent: { type: "select_salon", city, service, salonId, salonName },
    });
  }

  if (
    handoffPayload?.intent === "login" ||
    handoffPayload?.intent === "login_for_booking"
  ) {
    const selectedSlot = handoffPayload.selectedSlot as SearchResult | undefined;
    const body = {
      messages: [
        {
          role: "assistant",
          content:
            handoffPayload.intent === "login_for_booking"
              ? "Prijavi se da nastavimo sa zakazivanjem."
              : "Prijavi se da nastavimo.",
          attachToBlockType: "AuthBlock",
        },
      ],
      layout: [
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
      intent: { type: handoffPayload.intent },
    };

    return streamJson(body);
  }

  if (handoffPayload?.intent === "resume_booking_after_login") {
    const selectedSlot = handoffPayload.selectedSlot as SearchResult | undefined;
    const date = selectedSlot?.startTime?.split("T")[0] ?? "";
    console.debug("[AUTH_RESUME]", {
      selectedSlot,
      authState: { isAuthenticated, userName },
      restoredBookingState: handoffPayload,
    });
    const body = {
      messages: [
        {
          role: "assistant",
          content: selectedSlot
            ? "Uspešno si prijavljena. Nastavljamo sa zakazivanjem."
            : "Uspešno si prijavljena.",
          attachToBlockType: selectedSlot ? "AppointmentCalendarBlock" : "none",
        },
      ],
      layout: selectedSlot
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
        : [],
      intent: { type: "resume_booking_after_login" },
    };

    return streamJson(body);
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
    const body = {
      messages: [
        {
          role: "assistant",
          content: contact?.name
            ? `Spremno. Proveri podatke za termin za ${contact.name}.`
            : "Spremno. Proveri podatke za termin.",
          attachToBlockType: "AppointmentCalendarBlock",
        },
      ],
      layout: selectedSlot
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
        : [],
      intent: { type: "create_booking" },
    };

    return streamJson(body);
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

    return streamJson({
      messages: [
        {
          role: "assistant",
          content: message,
          attachToBlockType:
            alternatives.length > 0 ? "AppointmentCalendarBlock" : "none",
        },
      ],
      layout:
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
          : [],
      intent: {
        type: "booking_conflict",
        service,
        city,
        salonId: originalSalonId,
        salonName: originalSalonName,
      },
    });
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

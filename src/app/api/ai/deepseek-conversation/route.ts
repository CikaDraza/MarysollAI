// app/api/ai/deepseek-conversation/route.ts
import { NextResponse } from "next/server";
import { Message } from "@/types/ai/deepseek";
import { fetchPlatformKnowledge } from "@/lib/ai/platform-knowledge";
import { parseMariaResponse } from "@/lib/ai/schemas/maria.schema";
import { extractBookingIntentFromConversation } from "@/lib/ai/extractBookingIntentFromConversation";
import { detectCityAvailabilityQuestion } from "@/lib/ai/detectCityAvailabilityQuestion";
import { runBookingSearch } from "@/lib/search/runBookingSearch";
import { buildBookingAssistantReply } from "@/lib/ai/buildBookingAssistantReply";
import { detectSlotSelectionIntent } from "@/lib/ai/detectSlotSelectionIntent";
import { detectBookingConfirmation } from "@/lib/ai/detectBookingConfirmation";
import { detectContactInfo } from "@/lib/ai/detectContactInfo";
import { mergeIntentWithConversationContext } from "@/lib/ai/mergeIntentWithConversationContext";
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

  return NextResponse.json({
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

function isPricesIntent(text: string): boolean {
  const normalized = text.toLowerCase();
  return /\b(cenovnik|cene|cena|koliko košta|koliko kosta|price list)\b/.test(normalized);
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
    input.intent.service ||
      input.intent.category ||
      input.detectedCityQuestion ||
      /termin|slobod|ima li|da li ima|imate|radite|masaz|masaž|sisanj|šišanj|fenir|nokti|smink|šmink/.test(normalized),
  );
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

function buildMariaSystemPrompt(
  salonsText: string,
  servicesText: string,
  citiesText: string,
  categoriesText: string,
  userName: string,
  isAuthenticated: boolean,
  userCity: string,
  language: string,
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
Govoriš u ženskom rodu. Ton: kratak, jasan, prijatan.
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

## Šema (ISTA polja za sve odgovore):
{
  "type": "answer" | "handoff",
  "message": "kratka rečenica korisniku",
  "targetAgent": "booking" | "auth" | "prices" | "appointments" | "testimonials" | "none",
  "payload": { "intent": "...", "service": "...", "city": "...", "date": "YYYY-MM-DD", "time": "HH:MM" }
}

## Pravila:
- "answer" → targetAgent UVEK "none". Payload se ignoriše.
- "handoff" → targetAgent OBAVEZNO jedan od: booking, auth, prices, appointments, testimonials.
- "payload" je opcionalno; popuni samo polja koja korisnik EKSPLICITNO pomenuo.
- "message" je UVEK kratka rečenica (1 rečenica) na jeziku korisnika.

## Primeri

Direktan odgovor (FAQ):
{"type":"answer","message":"Radimo u Novom Sadu i Beogradu.","targetAgent":"none"}

Handoff (booking):
{"type":"handoff","message":"Tražim slobodne termine za tebe.","targetAgent":"booking","payload":{"intent":"booking","service":"šišanje","date":"2026-05-11"}}

Handoff (termini):
{"type":"handoff","message":"Prikazujem tvoje termine.","targetAgent":"appointments"}

--------------------------------------------------
# AGENT HANDOFF — KADA KORISTITI

## TERMINI
Prepoznaješ: "moji termini", "šta sam zakazala", "reservations", "zakazano", "mogu li da vidim moje termine", "da li mogu da vidim moje termine", "pogledaj moje termine", "da li mi je termin odobren", "status termina", "da li je termin potvrđen", "čekam potvrdu", "je li moj termin odobren"
→ {"type":"handoff","message":"Prikazujem tvoje termine.","targetAgent":"appointments"}

## BOOKING
Prepoznaješ: "zakaži", "termin", "slobodan termin", "rezerviši", "booking", "sutra", "danas", "posle Xh", "hitno"
→ {"type":"handoff","message":"Tražim slobodne termine za tebe.","targetAgent":"booking","payload":{"intent":"booking"}}

## LOGIN / REGISTRACIJA
Prepoznaješ: "login", "prijavi me", "napravi nalog", "registracija", "uloguj", "zaboravio lozinku"
→ {"type":"handoff","message":"Otvaramo prijavu.","targetAgent":"auth"}

## CENOVNIK
Prepoznaješ: "cenovnik", "koliko košta", "cene", "price list", "šta košta"
→ {"type":"handoff","message":"Otvaramo cenovnik.","targetAgent":"prices"}

## UTISCI
Prepoznaješ: "utisci", "review", "komentar", "ocena"
→ {"type":"handoff","message":"Otvaramo utiske.","targetAgent":"testimonials"}

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

    if (isAuthIntent(latestUserText)) {
      return responseFromAssistant({
        message: selectedSlot
          ? "Otvaram prijavu da nastavimo zakazivanje tog termina."
          : "Otvaram prijavu.",
        intent: lastIntent,
        selectedSlot,
        aiBookingState: aiBookingStateBefore,
        pendingContact,
        mariaType: "handoff",
        targetAgent: "auth",
        payload: {
          intent: selectedSlot ? "login_for_booking" : "login",
          selectedSlot,
          aiBookingState: aiBookingStateBefore,
        },
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
        },
      });
    }

    if (isAppointmentsIntent(latestUserText)) {
      return responseFromAssistant({
        message: "Prikazujem tvoje termine.",
        intent: lastIntent,
        selectedSlot,
        aiBookingState: aiBookingStateBefore,
        pendingContact,
        mariaType: "handoff",
        targetAgent: "appointments",
        payload: { intent: "appointments" },
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
        },
      });
    }

    if (isPricesIntent(latestUserText)) {
      return responseFromAssistant({
        message: "Otvaram cenovnik.",
        intent: lastIntent,
        selectedSlot,
        aiBookingState: aiBookingStateBefore,
        pendingContact,
        mariaType: "handoff",
        targetAgent: "prices",
        payload: { intent: "prices" },
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
        },
      });
    }

    if (isBookingHelpIntent(latestUserText)) {
      return responseFromAssistant({
        message:
          "Napiši koju uslugu želiš, grad i okvirno vreme, na primer: Feniranje u Novom Sadu posle 13h.",
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

    const confirmation = detectBookingConfirmation({
      userMessage: latestUserText,
      previousState: aiBookingState,
      selectedSlot,
    });
    if (confirmation.intent === "confirm_booking" && confirmation.selectedSlot) {
      return responseFromAssistant({
        message: "Odlično. Samo mi pošaljite ime i telefon ili email za potvrdu termina.",
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
      return responseFromAssistant({
        message: formatReadyToBook(selectedSlot, nextContact),
        intent: extractedIntent,
        selectedSlot,
        slots: [selectedSlot],
        aiBookingState: "ready_to_book",
        pendingContact: nextContact,
        mariaType: "handoff",
        targetAgent: "booking",
        payload: {
          intent: "create_booking",
          selectedSlot,
          contact: nextContact,
          aiBookingState: "ready_to_book",
        },
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
        },
      });
    }

    const slotSelection = detectSlotSelectionIntent({
      userMessage: latestUserText,
      previousSlots: lastOfferedSlots,
      previousIntent: extractedIntent,
    });
    if (slotSelection.isSlotSelection && slotSelection.selectedSlot) {
      return responseFromAssistant({
        message: formatSelectedSlot(slotSelection.selectedSlot),
        intent: {
          ...extractedIntent,
          service: slotSelection.selectedSlot.serviceName,
          requestedCity: slotSelection.selectedSlot.city,
          city: slotSelection.selectedSlot.city,
        },
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
        },
      });
    }

    if (isRecoveredCityRejection(latestUserText)) {
      return responseFromAssistant({
        message: "Razumem, nema problema. Da li želite da proverim drugi grad, drugo vreme ili neku drugu uslugu?",
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
        },
      });
    }

    if (isAuthIntent(latestUserText)) {
      return responseFromAssistant({
        message: selectedSlot
          ? "Otvaram prijavu da nastavimo zakazivanje tog termina."
          : "Otvaram prijavu.",
        intent: extractedIntent,
        selectedSlot,
        aiBookingState: aiBookingStateBefore,
        pendingContact,
        mariaType: "handoff",
        targetAgent: "auth",
        payload: {
          intent: selectedSlot ? "login_for_booking" : "login",
          selectedSlot,
          aiBookingState: aiBookingStateBefore,
        },
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
      try {
        const searchResult = await withTimeout(
          runBookingSearch(extractedIntent),
          AI_TIMEOUT_MS,
          "booking search",
        );
        const reply = buildBookingAssistantReply({
          intent: extractedIntent,
          searchResult,
          acceptedEffectiveCity: Boolean(
            lastRecoveryState?.effectiveCity &&
              extractedIntent.requestedCity === lastRecoveryState.effectiveCity &&
              lastRecoveryState.requestedCity !== lastRecoveryState.effectiveCity,
          ),
        });
        const aiDebug = {
          rawExtractedIntent,
          mergedIntent: extractedIntent,
          lastIntent,
          lastRecoveryState,
          selectedSlotExists: Boolean(selectedSlot),
          contactDetected: contactInfo.hasContactInfo,
          aiBookingStateBefore,
          aiBookingStateAfter: "showing_options",
          extractedIntent,
          previousServiceIntent,
          detectedCityQuestion: cityQuestion.detected,
          requestedCity: searchResult.recoveryState?.requestedCity,
          effectiveCity: searchResult.recoveryState?.effectiveCity,
          recoveryScenario: searchResult.recoveryState?.recoveryScenario,
          searchResultsCount: searchResult.results.length,
          slotSelectionChecked: true,
          slotSelectionMatched: false,
          slotSelectionConfidence: slotSelection.confidence,
          skippedSearchBecauseSlotSelected: false,
          previousSlotsCount: lastOfferedSlots.length,
          aiBookingState: "showing_options",
          skippedSearchReason: undefined,
          handoffTriggered: false,
          targetAgent: "none",
          replyMode: reply.replyMode,
        };
        if (process.env.NODE_ENV !== "production") {
          console.debug("[AI_SEARCH_ORCHESTRATOR]", aiDebug);
        }
        return responseFromAssistant({
          message: reply.text,
          intent: extractedIntent,
          recoveryState: searchResult.recoveryState,
          slots: reply.slots,
          suggestions: reply.suggestedActions ?? searchResult.suggestions,
          aiBookingState: "showing_options",
          pendingContact,
          aiDebug,
        });
      } catch (error) {
        const message =
          "Trenutno ne mogu pouzdano da proverim termine. Pokušajte ponovo za trenutak.";
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
          effectiveCity: undefined,
          recoveryScenario: undefined,
          searchResultsCount: 0,
          slotSelectionChecked: true,
          slotSelectionMatched: false,
          slotSelectionConfidence: slotSelection.confidence,
          skippedSearchBecauseSlotSelected: false,
          previousSlotsCount: lastOfferedSlots.length,
          aiBookingState: "searching",
          skippedSearchReason: undefined,
          handoffTriggered: false,
          targetAgent: "none",
          replyMode: "search_error",
          errorReason: error instanceof Error ? error.message : String(error),
        };
        console.error("[AI_SEARCH_ORCHESTRATOR_ERROR]", aiDebug);
        return responseFromAssistant({
          message,
          intent: extractedIntent,
          aiDebug,
          error: aiDebug.errorReason,
        });
      }
    }

    const { salonsText, servicesText, citiesText, categoriesText } =
      await fetchPlatformKnowledge();

    const systemPrompt = buildMariaSystemPrompt(
      salonsText,
      servicesText,
      citiesText,
      categoriesText,
      userName,
      isAuthenticated,
      userCity,
      language,
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
          stream: false,
          response_format: { type: "json_object" },
        }),
      },
    ), AI_TIMEOUT_MS, "deepseek");

    if (!response.ok) {
      const error = await response.json();
      console.error("DeepSeek API error:", error);
      return responseFromAssistant({
        message: "Trenutno ne mogu da završim odgovor. Pokušajte ponovo za trenutak.",
        error: error.error?.message || "DeepSeek API error",
        aiDebug: { replyMode: "deepseek_error", errorReason: error.error?.message || "DeepSeek API error" },
      });
    }

    const data = await response.json();

    // Validate Maria's response against the schema. Replace `choices[0].message.content`
    // with a normalized JSON string so the client always receives the canonical shape
    // — even if the model regressed to the old `reply` field.
    const rawContent: string = data.choices?.[0]?.message?.content ?? "{}";
    const normalized = parseMariaResponse(rawContent);
    if (data.choices?.[0]?.message) {
      data.choices[0].message.content = JSON.stringify(normalized);
    }

    return NextResponse.json({
      ok: true,
      message: normalized.message,
      choices: data.choices,
      usage: data.usage,
      model: data.model,
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
        handoffTriggered: normalized.type === "handoff",
        targetAgent: normalized.targetAgent,
        replyMode: "deepseek_router",
      },
    });
  } catch (error) {
    console.error("Error in deepseek-conversation API:", error);
    return responseFromAssistant({
      message: "Nešto je zapelo, ali nisam izgubila razgovor. Pokušajte ponovo.",
      error: error instanceof Error ? error.message : "Internal server error",
      aiDebug: {
        replyMode: "route_error",
        errorReason: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

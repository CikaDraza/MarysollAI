import type { ClaudiaSubAgent } from "@/store/ai/agent-state";

export type RoutingAgent = "maria" | "claudia";

export interface AgentEntryRoutingInput {
  message: string;
  activeAgent: RoutingAgent;
  hasActiveBooking?: boolean;
}

export interface AgentEntryRoutingDecision {
  targetAgent: RoutingAgent;
  claudiaSubAgent?: ClaudiaSubAgent;
  reason:
    | "direct_booking"
    | "direct_appointments"
    | "booking_follow_up"
    | "faq_or_platform_info"
    | "acknowledgement"
    | "stay_with_active_agent";
  transitionMessage?: string;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function has(pattern: RegExp, text: string): boolean {
  return pattern.test(text);
}

function isAppointmentIntent(text: string): boolean {
  return has(
    /\b(moji termini|moje termine|moje rezervacije|sta sam zakaza|šta sam zakaza|zakazani termini|pregled termina|status termina|da li je termin|je li termin|otkazi termin|otkaži termin|pomeri termin|promeni termin|izmeni termin|reschedule|cancel appointment|my appointments|my bookings)\b/i,
    text,
  );
}

function isBookingFollowUp(text: string): boolean {
  return has(
    /\b(ipak|moze u|može u|u \d{1,2}(?::\d{2})?|kasnije|ranije|sutra ipak|danas ipak|taj termin|potvrdi|rezervisi|rezerviši)\b/i,
    text,
  );
}

function isBookingIntent(text: string): boolean {
  const hasBookingVerb = has(
    /\b(zakazi|zakaži|zakazem|zakažem|rezervisi|rezerviši|rezervacija|termin|slobodni termini|slobodnih termina|ima li slobod|da li ima slobod|availability|appointment|book)\b/i,
    text,
  );
  const hasTimeOrDate = has(
    /\b(danas|sutra|prekosutra|posle|nakon|od \d{1,2}|u \d{1,2}(?::\d{2})?|ujutru|popodne|veceras|večeras|today|tomorrow|after|at \d{1,2})\b/i,
    text,
  );
  const hasKnownService = has(
    /\b(maderoterap\w*|masaz\w*|masaž\w*|fenir\w*|sisanj\w*|šišanj\w*|nokti|nails|smink\w*|šmink\w*|makeup|trepav\w*|lashes|depil\w*|tretman\w*|limfna|drenaz\w*|drenaž\w*)\b/i,
    text,
  );
  const hasKnownCity = has(
    /\b(beograd|novi sad|bor|nis|niš|subotica|kragujevac|zrenjanin|pancevo|pančevo|cacak|čacak|kraljevo)\b/i,
    text,
  );

  return (
    (hasBookingVerb && (hasTimeOrDate || hasKnownService)) ||
    (hasKnownService && hasTimeOrDate)
  );
}

function isFaqOrPlatformInfo(text: string): boolean {
  return has(
    /\b(online plac|online plać|placanje|plaćanje|placam|plaćam|platim|platiti|plati online|online|kartic|pretplat|clanar|članar|subscription|salon info|informacije o salonu|najbliz|najbliž|najblizi salon|najbliži salon|kako funkcionise|kako funkcioniše|kako mogu da zakaz\w*|da li moram|potvrda naloga|email potvr|mejl potvr|sms|instagram|kontakt|pravila|uslovi)\b/i,
    text,
  );
}

export function isAcknowledgementMessage(message: string): boolean {
  const text = normalizeText(message);
  return /^(hvala|hvala puno|super|odlicno|odlično|u redu|uredu|ok|okej|vazi|važi|jasno|razumem|razumijem|dobro)$/i.test(text);
}

export function acknowledgementReply(message: string): string {
  const text = normalizeText(message);
  if (text.includes("hvala")) return "Nema na čemu.";
  return "U redu.";
}

function isSalonExistenceQuestion(text: string): boolean {
  const asksForSalon = has(
    /\b(postoji|imate|ima li|da li ima|da li postoji)\b.*\b(salon|salona|saloni)\b|\b(salon|salona|saloni)\b.*\b(postoji|imate|ima li|da li ima|da li postoji)\b/i,
    text,
  );
  const asksForServiceSalon = has(/\b(salon|salona|saloni)\b.*\b(za|u)\b/i, text);
  const asksForBooking = has(/\b(termin|slobod|zakaz|rezervis|appointment|booking)\b/i, text);

  return (asksForSalon || asksForServiceSalon) && !asksForBooking;
}

function isServiceAvailabilityInfoQuestion(text: string): boolean {
  const asksForAvailability = has(
    /\b(interesuje me|ima li|da li ima|da li postoji|postoji|imate|radite|u kojim gradovima|koji gradovi|daj.*gradove|dajte.*gradove|gradove u kojima)\b/i,
    text,
  );
  const mentionsService = has(
    /\b(maderoterap\w*|masaz\w*|masaž\w*|tretman\w*|fenir\w*|sisanj\w*|šišanj\w*|nokti|nails|smink\w*|šmink\w*|makeup|trepav\w*|lashes|depil\w*)\b/i,
    text,
  );
  const asksForBooking = has(/\b(termin|slobod|zakaz|rezervis|appointment|booking)\b/i, text);

  return asksForAvailability && mentionsService && !asksForBooking;
}

export function routeUserMessageToAgent(
  input: AgentEntryRoutingInput,
): AgentEntryRoutingDecision {
  const text = normalizeText(input.message);

  if (!text) {
    return {
      targetAgent: input.activeAgent,
      reason: "stay_with_active_agent",
    };
  }

  if (isAcknowledgementMessage(text)) {
    return {
      targetAgent: input.activeAgent,
      reason: "acknowledgement",
    };
  }

  const appointmentIntent = isAppointmentIntent(text);
  const salonExistenceQuestion = isSalonExistenceQuestion(text);
  const serviceAvailabilityInfo = isServiceAvailabilityInfoQuestion(text);
  const bookingFollowUp = isBookingFollowUp(text);
  const bookingIntent = !salonExistenceQuestion && !serviceAvailabilityInfo && isBookingIntent(text);
  const faqIntent = salonExistenceQuestion || serviceAvailabilityInfo || isFaqOrPlatformInfo(text);

  if (input.activeAgent === "maria") {
    if (appointmentIntent) {
      return {
        targetAgent: "claudia",
        claudiaSubAgent: "appointments",
        reason: "direct_appointments",
      };
    }
    if (bookingIntent) {
      return {
        targetAgent: "claudia",
        claudiaSubAgent: "booking",
        reason: "direct_booking",
      };
    }
    return {
      targetAgent: "maria",
      reason: faqIntent ? "faq_or_platform_info" : "stay_with_active_agent",
    };
  }

  if (appointmentIntent) {
    return {
      targetAgent: "claudia",
      claudiaSubAgent: "appointments",
      reason: "direct_appointments",
    };
  }

  if (bookingIntent || (input.hasActiveBooking && bookingFollowUp)) {
    return {
      targetAgent: "claudia",
      claudiaSubAgent: "booking",
      reason: bookingFollowUp ? "booking_follow_up" : "direct_booking",
    };
  }

  if (faqIntent) {
    return {
      targetAgent: "maria",
      reason: "faq_or_platform_info",
      transitionMessage: "Samo trenutak, Maria će vam objasniti.",
    };
  }

  return {
    targetAgent: "claudia",
    claudiaSubAgent: "booking",
    reason: "stay_with_active_agent",
  };
}

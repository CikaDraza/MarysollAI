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
    | "stay_with_active_agent"
    | "default_booking_concierge"
    | "b2b_marysoll_business"
    | "promotion_marketing"
    | "active_promo_interruption";
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

function isPromotionIntent(text: string): boolean {
  return has(
    /\b(promocij\w*|akcij\w*|popust\w*|last minute|specijaln\w* ponud\w*|kampanj\w*|newsletter|novost\w*|trend\w*|novi salon|sponzoris\w*)\b/i,
    text,
  );
}

function isB2BMarysollBusinessIntent(text: string): boolean {
  return has(
    /\b(moj salon|moj salon da bude|kako da prijavim salon|prijavim salon|vlasnik sam salona|imam salon|saradnj\w*|partnerstv\w*|za salone|platforma za salone|koliko kosta za salon|koliko košta za salon|kako marysoll radi za salone|marysoll za vlasnike salona|deo marysoll)\b/i,
    text,
  );
}

export function isMariaOwnedIntent(text: string): boolean {
  const normalized = normalizeText(text);
  return isB2BMarysollBusinessIntent(normalized) || isPromotionIntent(normalized);
}

function mariaReason(text: string): AgentEntryRoutingDecision["reason"] {
  if (isPromotionIntent(text)) return "promotion_marketing";
  if (isB2BMarysollBusinessIntent(text)) return "b2b_marysoll_business";
  return "active_promo_interruption";
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

function isBookingDataQuestion(text: string): boolean {
  if (has(/\b(online plac|online plać|placanje|plaćanje|placam|plaćam|platim|platiti|kartic)\b/i, text)) {
    return false;
  }
  return has(
    /\b(salon|salona|saloni|termin|slobod|najbliz|najbliž|uslug|grad|ruma|beograd|novi sad|postoji|ima li|da li taj salon)\b/i,
    text,
  );
}

export function routeUserMessageToAgent(
  input: AgentEntryRoutingInput,
): AgentEntryRoutingDecision {
  const text = normalizeText(input.message);

  if (!text) {
    return {
      targetAgent: "claudia",
      claudiaSubAgent: "booking",
      reason: "default_booking_concierge",
    };
  }

  if (isAcknowledgementMessage(text)) {
    return {
      targetAgent: input.activeAgent,
      reason: "acknowledgement",
    };
  }

  if (isMariaOwnedIntent(text)) {
    return {
      targetAgent: "maria",
      reason: mariaReason(text),
    };
  }

  const appointmentIntent = isAppointmentIntent(text);
  const bookingFollowUp = isBookingFollowUp(text);

  if (appointmentIntent) {
    return {
      targetAgent: "claudia",
      claudiaSubAgent: "appointments",
      reason: "direct_appointments",
    };
  }

  const bookingIntent = isBookingIntent(text);
  if (bookingIntent || (input.hasActiveBooking && bookingFollowUp)) {
    return {
      targetAgent: "claudia",
      claudiaSubAgent: "booking",
      reason: bookingFollowUp ? "booking_follow_up" : "direct_booking",
    };
  }

  if (input.activeAgent === "claudia" && isBookingDataQuestion(text)) {
    console.debug("[CLAUDIA_PINGPONG_BLOCKED]", {
      message: input.message,
      reason: "default_claudia_ownership",
    });
  }

  return {
    targetAgent: "claudia",
    claudiaSubAgent: "booking",
    reason: "default_booking_concierge",
  };
}

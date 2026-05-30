import type { PlatformKnowledge } from "@/lib/ai/platform-knowledge";
import type { MariaContract } from "@/lib/ai/schemas/maria-contract.schema";
import type { MeaningCandidate } from "@/lib/ai/semantic-interpreter/semantic-interpreter.schema";
import {
  formatNearestSalonAnswer,
  resolveCityServiceAvailability,
} from "@/lib/ai/guards/agent-data-truth-guard";

function contract(input: {
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

function serviceLabel(candidate: MeaningCandidate): string | undefined {
  return (
    candidate.entities.service ??
    candidate.entities.services?.join(", ") ??
    candidate.entities.category
  );
}

function cityHasSalon(
  city: string | undefined,
  platformKnowledge?: PlatformKnowledge,
): boolean {
  if (!city) return false;
  return Boolean(
    platformKnowledge?.raw?.salons?.some(
      (salon) =>
        salon.city?.localeCompare(city, "sr", { sensitivity: "base" }) === 0,
    ),
  );
}

function existenceMessage(
  candidate: MeaningCandidate,
  platformKnowledge?: PlatformKnowledge,
): string {
  const city = candidate.entities.city ?? candidate.entities.requestedCity;
  const service = serviceLabel(candidate);
  if (!city) return "Za koji grad da proverim?";
  if (!service) return "Za koju uslugu da proverim?";
  if (!cityHasSalon(city, platformKnowledge)) {
    return `Trenutno nemamo salone u ${city}. Mogu da proverim najbliže gradove — odgovara?`;
  }
  return `Proveravam da li imamo ${service} u ${city}.`;
}

function availabilityAwareMessage(
  candidate: MeaningCandidate,
  platformKnowledge?: PlatformKnowledge,
): { message: string; shouldHandoff: boolean } {
  const city = candidate.entities.city ?? candidate.entities.requestedCity;
  const service = serviceLabel(candidate);
  const availability = resolveCityServiceAvailability({
    city,
    service,
    category: candidate.entities.category,
    platformKnowledge,
    semanticMemory: platformKnowledge?.semanticMemory,
  });

  if (city && !availability.hasSalonInCity) {
    return {
      message: formatNearestSalonAnswer({
        requestedCity: city,
        alternative: availability.nearestAlternatives[0],
      }),
      shouldHandoff: false,
    };
  }

  if (
    city &&
    (service || candidate.entities.category) &&
    !availability.hasServiceInCity
  ) {
    return {
      message: formatNearestSalonAnswer({
        requestedCity: city,
        alternative: availability.nearestAlternatives[0],
      }),
      shouldHandoff: false,
    };
  }

  if (candidate.userGoal === "check_existence") {
    if (city && availability.matchingSalons.length > 0 && !service) {
      const names = availability.matchingSalons
        .map((salon) => salon.name)
        .filter(Boolean)
        .slice(0, 3);
      return {
        message: `Da, imamo ${availability.matchingSalons.length === 1 ? "salon" : "salone"} u ${city}: ${names.join(", ")}.`,
        shouldHandoff: false,
      };
    }
    return {
      message: existenceMessage(candidate, platformKnowledge),
      shouldHandoff: false,
    };
  }

  return {
    message: city
      ? service
        ? `Proveravam dostupne termine za ${service} u ${city}.`
        : `Proveravam dostupne termine u ${city}.`
      : service
        ? `Proveravam dostupne termine za ${service}.`
        : "Proveravam dostupne termine.",
    shouldHandoff: true,
  };
}

function entities(
  candidate: MeaningCandidate,
): MariaContract["intent"]["entities"] {
  return {
    city: candidate.entities.city,
    requestedCity: candidate.entities.requestedCity,
    service:
      candidate.entities.service ?? candidate.entities.services?.join(", "),
    category: candidate.entities.category,
    salonName: candidate.entities.salonName,
    date: candidate.entities.date,
    dateMode: candidate.entities.dateMode,
    time: candidate.entities.time,
    timeWindowStart: candidate.entities.timeWindowStart,
    timeWindowEnd: candidate.entities.timeWindowEnd,
  };
}

export function meaningToMariaContract(
  candidate: MeaningCandidate,
  context: {
    platformKnowledge?: PlatformKnowledge;
  } = {},
): MariaContract {
  const candidateEntities = entities(candidate);
  const service = serviceLabel(candidate);
  const city = candidate.entities.city ?? candidate.entities.requestedCity;

  if (candidate.confidence < 0.55 || candidate.userGoal === "clarify") {
    const missing = candidate.ambiguity?.missing ?? [];
    const message = missing.includes("city")
      ? "Za koji grad da proverim?"
      : missing.includes("service")
        ? "Za koju uslugu da proverim?"
        : "Da li mislite na zakazivanje ili informacije o salonu?";
    return contract({
      kind: "clarification",
      message,
      domain: "unknown",
      action: "clarify",
      confidence: candidate.confidence,
      entities: candidateEntities,
      missingFields: missing,
      shouldHandoff: false,
      targetAgent: "maria",
      reason: "semantic_low_confidence",
    });
  }

  if (candidate.userGoal === "close_conversation") {
    return contract({
      kind: "faq_answer",
      message: "Nema na čemu — tu sam ako zatreba.",
      domain: "faq",
      action: "answer_question",
      confidence: candidate.confidence,
      entities: {},
      shouldHandoff: false,
      targetAgent: "maria",
      reason: "semantic_close_conversation",
    });
  }

  if (
    (candidate.userGoal === "check_availability" ||
      candidate.userGoal === "book") &&
    !city
  ) {
    return contract({
      kind: "clarification",
      message: "Za koji grad da proverim termine?",
      domain: "booking",
      action: "clarify",
      confidence: candidate.confidence,
      entities: candidateEntities,
      missingFields: ["city"],
      shouldHandoff: false,
      targetAgent: "maria",
      reason: "semantic_missing_city",
    });
  }

  if (
    (candidate.userGoal === "check_availability" ||
      candidate.userGoal === "book") &&
    !service
  ) {
    return contract({
      kind: "clarification",
      message: "Za koju uslugu da proverim termine?",
      domain: "booking",
      action: "clarify",
      confidence: candidate.confidence,
      entities: candidateEntities,
      missingFields: ["service"],
      shouldHandoff: false,
      targetAgent: "maria",
      reason: "semantic_missing_service",
    });
  }

  if (
    candidate.userGoal === "check_availability" ||
    candidate.userGoal === "book"
  ) {
    const resolved = availabilityAwareMessage(
      candidate,
      context.platformKnowledge,
    );
    return contract({
      kind: resolved.shouldHandoff ? "intent" : "faq_answer",
      message: resolved.message,
      domain: resolved.shouldHandoff ? "booking" : "faq",
      action: resolved.shouldHandoff
        ? candidate.userGoal === "book"
          ? "book_slot"
          : "search_slots"
        : "answer_question",
      confidence: candidate.confidence,
      entities: candidateEntities,
      shouldHandoff: resolved.shouldHandoff,
      targetAgent: resolved.shouldHandoff ? "claudia" : "maria",
      reason: resolved.shouldHandoff
        ? "semantic_booking_or_availability"
        : "semantic_availability_fact",
    });
  }

  if (candidate.userGoal === "view_appointments") {
    return contract({
      kind: "intent",
      message: "Pripremam pregled vaših termina.",
      domain: "appointments",
      action: "view_appointments",
      confidence: candidate.confidence,
      entities: candidateEntities,
      shouldHandoff: true,
      targetAgent: "claudia",
      reason: "semantic_view_appointments",
    });
  }

  if (candidate.userGoal === "cancel" || candidate.userGoal === "reschedule") {
    return contract({
      kind: "intent",
      message:
        candidate.userGoal === "cancel"
          ? "U redu, proveravam koji termin želite da otkažete."
          : "U redu, proveravam koji termin želite da promenite.",
      domain: candidate.userGoal === "cancel" ? "cancel" : "reschedule",
      action:
        candidate.userGoal === "cancel"
          ? "cancel_appointment"
          : "reschedule_appointment",
      confidence: candidate.confidence,
      entities: candidateEntities,
      shouldHandoff: true,
      targetAgent: "claudia",
      reason: "semantic_appointment_management",
    });
  }

  if (candidate.userGoal === "login") {
    return contract({
      kind: "intent",
      message: "Otvaram prijavu.",
      domain: "auth",
      action: "login",
      confidence: candidate.confidence,
      entities: candidateEntities,
      shouldHandoff: true,
      targetAgent: "auth",
      reason: "semantic_auth",
    });
  }

  if (
    candidate.userGoal === "ask_information" ||
    candidate.userGoal === "check_existence"
  ) {
    const missing = [...(city ? [] : ["city"])];
    if (
      candidate.utteranceType === "service_city_question" &&
      missing.length > 0
    ) {
      return contract({
        kind: "clarification",
        message: "Za koji grad da proverim?",
        domain: "faq",
        action: "clarify",
        confidence: candidate.confidence,
        entities: candidateEntities,
        missingFields: missing,
        shouldHandoff: false,
        targetAgent: "maria",
        reason: "semantic_missing_info_field",
      });
    }
    const resolved = availabilityAwareMessage(
      candidate,
      context.platformKnowledge,
    );
    return contract({
      kind: "faq_answer",
      message: resolved.message,
      domain: "faq",
      action: "answer_question",
      confidence: candidate.confidence,
      entities: candidateEntities,
      shouldHandoff: false,
      targetAgent: "maria",
      reason: "semantic_information",
    });
  }

  return contract({
    kind: "clarification",
    message: "Da li mislite na zakazivanje ili informacije o salonu?",
    domain: "unknown",
    action: "clarify",
    confidence: candidate.confidence,
    entities: candidateEntities,
    shouldHandoff: false,
    targetAgent: "maria",
    reason: "semantic_unknown",
  });
}

import { z } from "zod";
import type { MariaResponse, MariaPayload } from "@/lib/ai/schemas/maria.schema";

const FALLBACK_MESSAGE =
  "Nisam sigurna da sam razumela. Možeš li da napišeš malo konkretnije?";

const OptionalHourSchema = z.preprocess(
  (value) => {
    if (typeof value === "string" && value.trim() !== "") return Number(value);
    return value;
  },
  z.number().nullable().optional(),
);

const ConfidenceSchema = z.preprocess(
  (value) => {
    if (typeof value === "string" && value.trim() !== "") return Number(value);
    return value;
  },
  z.number().transform((value) => Math.min(1, Math.max(0, value))),
);

export const MariaContractKindSchema = z.enum([
  "faq_answer",
  "intent",
  "clarification",
  "unknown",
]);

export const MariaContractDomainSchema = z.enum([
  "faq",
  "booking",
  "appointments",
  "auth",
  "prices",
  "reviews",
  "notify_me",
  "cancel",
  "reschedule",
  "unknown",
]);

export const MariaContractActionSchema = z.enum([
  "answer_question",
  "search_slots",
  "book_slot",
  "view_appointments",
  "cancel_appointment",
  "reschedule_appointment",
  "show_prices",
  "login",
  "register",
  "create_notify_watch",
  "clarify",
  "none",
]);

export const MariaContractTargetAgentSchema = z.enum([
  "maria",
  "claudia",
  "auth",
  "none",
]);

export const MariaContractEntitiesSchema = z
  .object({
    city: z.string().optional(),
    requestedCity: z.string().optional(),
    service: z.string().optional(),
    serviceId: z.string().optional(),
    serviceName: z.string().optional(),
    category: z.string().optional(),
    subcategory: z.string().optional(),
    salonId: z.string().optional(),
    salonName: z.string().optional(),
    date: z.string().optional(),
    dateMode: z.string().optional(),
    time: z.string().optional(),
    timeWindowStart: OptionalHourSchema,
    timeWindowEnd: OptionalHourSchema,
    appointmentId: z.string().optional(),
    selectedSlot: z.unknown().optional(),
    contact: z
      .object({
        name: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        instagram: z.string().optional(),
      })
      .partial()
      .optional(),
  })
  .partial()
  .default({});

export const MariaContractSchema = z.object({
  kind: MariaContractKindSchema,
  message: z.string(),
  intent: z.object({
    domain: MariaContractDomainSchema,
    action: MariaContractActionSchema,
    confidence: ConfidenceSchema,
    entities: MariaContractEntitiesSchema,
    missingFields: z.array(z.string()).default([]),
  }),
  routing: z.object({
    shouldHandoff: z.boolean(),
    targetAgent: MariaContractTargetAgentSchema,
    reason: z.string(),
  }),
});

export type MariaContract = z.infer<typeof MariaContractSchema>;

export const MARIA_CONTRACT_FALLBACK: MariaContract = {
  kind: "unknown",
  message: FALLBACK_MESSAGE,
  intent: {
    domain: "unknown",
    action: "clarify",
    confidence: 0,
    entities: {},
    missingFields: [],
  },
  routing: {
    shouldHandoff: false,
    targetAgent: "maria",
    reason: "parse_failed",
  },
};

function stripCodeFences(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }
  return text.trim();
}

function parseRaw(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const cleaned = stripCodeFences(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export function parseMariaContract(raw: unknown): MariaContract {
  const parsed = MariaContractSchema.safeParse(parseRaw(raw));
  if (parsed.success) return parsed.data;
  return MARIA_CONTRACT_FALLBACK;
}

function compactUndefined<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function entitiesToPayload(entities: MariaContract["intent"]["entities"]): MariaPayload {
  return compactUndefined({
    category: entities.category,
    subcategory: entities.subcategory,
    service: entities.service,
    serviceId: entities.serviceId,
    serviceName: entities.serviceName,
    city: entities.city,
    requestedCity: entities.requestedCity,
    salonId: entities.salonId,
    salonName: entities.salonName,
    date: entities.date,
    dateMode: entities.dateMode,
    time: entities.time,
    timeWindowStart: entities.timeWindowStart,
    timeWindowEnd: entities.timeWindowEnd,
    selectedSlot: entities.selectedSlot,
    contact: entities.contact,
  });
}

function legacyIntentForContract(contract: MariaContract): string {
  const { domain, action } = contract.intent;
  if (domain === "booking" && action === "search_slots") return "booking";
  if (domain === "booking" && action === "book_slot") return "create_booking";
  if (domain === "appointments" && action === "view_appointments") return "appointments";
  if (domain === "cancel" || action === "cancel_appointment") return "cancel_appointment";
  if (domain === "reschedule" || action === "reschedule_appointment") return "update_appointment";
  if (domain === "prices" || action === "show_prices") return "prices";
  if (domain === "auth" && action === "register") return "login";
  if (domain === "auth" && action === "login" && contract.intent.entities.selectedSlot) {
    return "login_for_booking";
  }
  if (domain === "auth" && action === "login") return "login";
  // Legacy Claudia does not yet have a notify_me intent; route through the
  // booking-compatible fast path while preserving the canonical action.
  if (domain === "notify_me" || action === "create_notify_watch") return "booking";
  return action !== "none" ? action : domain;
}

function legacyTargetForContract(contract: MariaContract): MariaResponse["targetAgent"] {
  if (contract.routing.targetAgent === "auth") return "auth";
  if (contract.routing.targetAgent !== "claudia") return "none";

  switch (contract.intent.domain) {
    case "appointments":
    case "cancel":
    case "reschedule":
      return "appointments";
    case "prices":
      return "prices";
    case "reviews":
      return "testimonials";
    case "booking":
    case "notify_me":
      return "booking";
    default:
      return "booking";
  }
}

export function mariaContractToLegacyResponse(contract: MariaContract): MariaResponse {
  if (contract.kind === "faq_answer" || !contract.routing.shouldHandoff) {
    return {
      type: "answer",
      message: contract.message,
      targetAgent: "none",
    };
  }

  const payload: MariaPayload & Record<string, unknown> = {
    ...entitiesToPayload(contract.intent.entities),
    intent: legacyIntentForContract(contract),
  };

  if (contract.intent.domain === "notify_me") {
    payload.action = "create_notify_watch";
  }
  if (contract.intent.entities.appointmentId) {
    payload.appointmentId = contract.intent.entities.appointmentId;
  }

  return {
    type: "handoff",
    message: contract.message,
    targetAgent: legacyTargetForContract(contract),
    payload,
  };
}

function domainFromLegacy(response: MariaResponse): MariaContract["intent"]["domain"] {
  if (response.type === "answer") return response.targetAgent === "none" ? "faq" : "unknown";
  const payloadAction = (response.payload as Record<string, unknown> | undefined)?.action;
  if (payloadAction === "create_notify_watch") return "notify_me";
  if (response.targetAgent === "auth") return "auth";
  if (response.targetAgent === "prices") return "prices";
  if (response.targetAgent === "appointments") {
    if (response.payload?.intent === "cancel_appointment") return "cancel";
    if (response.payload?.intent === "update_appointment") return "reschedule";
    return "appointments";
  }
  if (response.targetAgent === "testimonials") return "reviews";
  if (response.targetAgent === "booking") return "booking";
  return "unknown";
}

function actionFromLegacy(response: MariaResponse): MariaContract["intent"]["action"] {
  if (response.type === "answer") return "answer_question";
  const payloadAction = (response.payload as Record<string, unknown> | undefined)?.action;
  if (payloadAction === "create_notify_watch") return "create_notify_watch";
  switch (response.payload?.intent) {
    case "appointments":
      return "view_appointments";
    case "cancel_appointment":
      return "cancel_appointment";
    case "update_appointment":
      return "reschedule_appointment";
    case "prices":
      return "show_prices";
    case "login":
    case "login_for_booking":
      return "login";
    case "create_booking":
      return "book_slot";
    case "booking":
      return "search_slots";
    default:
      return response.type === "handoff" ? "search_slots" : "none";
  }
}

function contractTargetFromLegacy(response: MariaResponse): MariaContract["routing"]["targetAgent"] {
  if (response.type !== "handoff" || response.targetAgent === "none") return "none";
  if (response.targetAgent === "auth") return "auth";
  return "claudia";
}

export function legacyMariaResponseToContract(response: MariaResponse): MariaContract {
  const domain = domainFromLegacy(response);
  const action = actionFromLegacy(response);
  const entities = MariaContractEntitiesSchema.parse(response.payload ?? {});

  return {
    kind: response.type === "handoff" ? "intent" : domain === "faq" ? "faq_answer" : "unknown",
    message: response.message,
    intent: {
      domain,
      action,
      confidence: response.type === "handoff" ? 1 : 0.8,
      entities,
      missingFields: [],
    },
    routing: {
      shouldHandoff: response.type === "handoff" && response.targetAgent !== "none",
      targetAgent: contractTargetFromLegacy(response),
      reason: response.type === "handoff" ? "legacy_handoff" : "legacy_answer",
    },
  };
}

/*
Contract examples:

FAQ:
{ kind: "faq_answer", intent: { domain: "faq", action: "answer_question" }, routing: { shouldHandoff: false } }

Booking:
{ kind: "intent", intent: { domain: "booking", action: "search_slots", entities: { city: "Beograd", service: "šminkanje", date: "YYYY-MM-DD", timeWindowStart: 15 } }, routing: { shouldHandoff: true, targetAgent: "claudia" } }

Appointments:
{ kind: "intent", intent: { domain: "appointments", action: "view_appointments" }, routing: { shouldHandoff: true, targetAgent: "claudia" } }

Auth:
{ kind: "intent", intent: { domain: "auth", action: "login" }, routing: { shouldHandoff: true, targetAgent: "auth" } }

NotifyMe:
{ kind: "intent", intent: { domain: "notify_me", action: "create_notify_watch" }, routing: { shouldHandoff: true, targetAgent: "claudia" } }
*/

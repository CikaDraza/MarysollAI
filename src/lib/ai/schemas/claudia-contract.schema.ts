import { z } from "zod";
import type { TextMessage } from "@/types/ai/ai.text-engine";
import type { BaseBlock, BlockTypes } from "@/types/landing-block";
import type { ClaudiaIntent } from "@/lib/ai/schemas/claudia.schema";

const FALLBACK_MESSAGE =
  "Izvini, dogodila se greška. Hajde da krenemo ponovo: napiši koju uslugu želiš, u kom gradu i u koje vreme.";

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
  z.number().transform((value) => Math.min(1, Math.max(0, value))).default(0),
);

export const ClaudiaContractKindSchema = z.enum([
  "booking_result",
  "clarification",
  "appointments",
  "prices",
  "auth",
  "recovery",
  "confirmation",
  "unknown",
]);

export const ClaudiaWorkflowDomainSchema = z.enum([
  "booking",
  "appointments",
  "prices",
  "auth",
  "recovery",
  "unknown",
]);

export const ClaudiaWorkflowStatusSchema = z.enum([
  "idle",
  "in_progress",
  "waiting_for_user",
  "ready",
  "completed",
  "failed",
]);

export const ClaudiaNextActionTypeSchema = z.enum([
  "SHOW_SLOTS",
  "OPEN_BOOKING_MODAL",
  "ASK_CLARIFICATION",
  "SHOW_APPOINTMENTS",
  "SHOW_PRICES",
  "SHOW_SALONS",
  "SHOW_AUTH",
  "SHOW_RECOVERY_ALTERNATIVES",
  "SHOW_CANCEL_CONFIRMATION",
  "SHOW_UPDATE_CONFIRMATION",
  "OFFER_NOTIFY_ME",
  "NONE",
]);

const LayoutBlockTypeSchema = z.enum([
  "AuthBlock",
  "LoginBlock",
  "LogoutBlock",
  "RegisterBlock",
  "ResetPasswordBlock",
  "ForgotPasswordBlock",
  "CalendarBlock",
  "AppointmentCalendarBlock",
  "AppointmentCancelConfirmBlock",
  "AppointmentUpdateConfirmBlock",
  "ServicePriceBlock",
  "TestimonialBlock",
  "NewsletterFormBlock",
  "WhyChooseUsBlock",
  "CityListBlock",
  "SalonListBlock",
  "NotifyMeBlock",
]);

const ClaudiaBlockSchema = z
  .object({
    type: LayoutBlockTypeSchema,
    priority: z.number().default(1),
    metadata: z.record(z.string(), z.unknown()).default({}),
    query: z.string().optional(),
  })
  .passthrough();

const ClaudiaEntitiesSchema = z
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
    appointment: z.unknown().optional(),
    appointments: z.unknown().optional(),
    selectedSlot: z.unknown().optional(),
    slots: z.array(z.unknown()).optional(),
    alternatives: z.array(z.unknown()).optional(),
    salons: z.array(z.unknown()).optional(),
    contact: z.unknown().optional(),
    mode: z.string().optional(),
    appointmentListMode: z.string().optional(),
  })
  .partial()
  .catchall(z.unknown())
  .default({});

export const ClaudiaContractSchema = z.object({
  kind: ClaudiaContractKindSchema,
  message: z.string(),
  workflow: z.object({
    domain: ClaudiaWorkflowDomainSchema,
    step: z.string(),
    status: ClaudiaWorkflowStatusSchema,
  }),
  nextAction: z.object({
    type: ClaudiaNextActionTypeSchema,
    reason: z.string().optional(),
  }),
  ui: z.object({
    blocks: z.array(ClaudiaBlockSchema).default([]),
    focusBlock: LayoutBlockTypeSchema.optional(),
    hideBlocks: z.array(LayoutBlockTypeSchema).default([]),
    showBlocks: z.array(LayoutBlockTypeSchema).default([]),
    scrollTo: LayoutBlockTypeSchema.optional(),
  }),
  intent: z.object({
    type: z.string().optional(),
    confidence: ConfidenceSchema,
    entities: ClaudiaEntitiesSchema,
    missingFields: z.array(z.string()).default([]),
  }),
});

export type ClaudiaContract = z.infer<typeof ClaudiaContractSchema>;

export type LegacyClaudiaResponse = {
  messages: TextMessage[];
  layout: BaseBlock[];
  intent?: Record<string, unknown>;
};

export const CLAUDIA_CONTRACT_FALLBACK: ClaudiaContract = {
  kind: "unknown",
  message: FALLBACK_MESSAGE,
  workflow: {
    domain: "unknown",
    step: "parse_failed",
    status: "failed",
  },
  nextAction: {
    type: "ASK_CLARIFICATION",
    reason: "parse_failed",
  },
  ui: {
    blocks: [],
    hideBlocks: [],
    showBlocks: [],
  },
  intent: {
    type: "unknown",
    confidence: 0,
    entities: {},
    missingFields: [],
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

function isLegacyClaudiaResponse(value: unknown): value is LegacyClaudiaResponse {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.messages) || Array.isArray(record.layout);
}

export function parseClaudiaContract(raw: unknown): ClaudiaContract {
  const parsedRaw = parseRaw(raw);
  const parsed = ClaudiaContractSchema.safeParse(parsedRaw);
  if (parsed.success) return parsed.data;
  if (isLegacyClaudiaResponse(parsedRaw)) {
    return legacyClaudiaResponseToContract(parsedRaw);
  }
  return CLAUDIA_CONTRACT_FALLBACK;
}

function compactUndefined<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function defaultMetadata(entities: ClaudiaContract["intent"]["entities"]): Record<string, unknown> {
  return compactUndefined({
    serviceId: entities.serviceId ?? "",
    serviceName: entities.serviceName ?? entities.service ?? "",
    variantName: "",
    service: entities.service,
    category: entities.category,
    subcategory: entities.subcategory,
    city: entities.requestedCity ?? entities.city,
    date: entities.date,
    time: entities.time,
    timeWindowStart: entities.timeWindowStart,
    timeWindowEnd: entities.timeWindowEnd,
    salonId: entities.salonId,
    salonName: entities.salonName,
    slots: entities.slots ?? entities.alternatives,
    appointmentId: entities.appointmentId,
    appointment: entities.appointment,
    appointments: entities.appointments,
    selectedSlot: entities.selectedSlot,
    contact: entities.contact,
  });
}

function buildBlock(
  type: Exclude<BlockTypes, "none">,
  entities: ClaudiaContract["intent"]["entities"],
): BaseBlock {
  const baseMetadata = defaultMetadata(entities);
  const metadata =
    type === "AuthBlock"
      ? { serviceId: "", serviceName: "", variantName: "", mode: entities.mode ?? "login", ...baseMetadata }
      : type === "CalendarBlock"
        ? {
            serviceId: "",
            serviceName: "",
            variantName: "",
            mode: entities.mode ?? "list",
            appointmentListMode: entities.appointmentListMode ?? "all",
            ...baseMetadata,
          }
        : type === "SalonListBlock"
          ? { serviceId: "", serviceName: entities.service ?? "", variantName: "", ...baseMetadata, salons: entities.salons ?? [] }
          : { serviceId: "", serviceName: "", variantName: "", ...baseMetadata };

  return {
    type,
    priority: 1,
    metadata: metadata as BaseBlock["metadata"],
  } as BaseBlock;
}

function blocksFromNextAction(contract: ClaudiaContract): BaseBlock[] {
  const entities = contract.intent.entities;
  switch (contract.nextAction.type) {
    case "SHOW_SLOTS":
    case "SHOW_RECOVERY_ALTERNATIVES":
      return [buildBlock("AppointmentCalendarBlock", entities)];
    case "OPEN_BOOKING_MODAL":
      return [];
    case "SHOW_APPOINTMENTS":
      return [buildBlock("CalendarBlock", entities)];
    case "SHOW_PRICES":
      if (entities.salonId || entities.salonName) return [buildBlock("ServicePriceBlock", entities)];
      return [buildBlock("SalonListBlock", entities)];
    case "SHOW_SALONS":
      return [buildBlock("SalonListBlock", entities)];
    case "SHOW_AUTH":
      return [buildBlock("AuthBlock", entities)];
    case "OFFER_NOTIFY_ME":
      return [buildBlock("NotifyMeBlock", entities)];
    case "SHOW_CANCEL_CONFIRMATION":
      return [buildBlock("AppointmentCancelConfirmBlock", entities)];
    case "ASK_CLARIFICATION":
    case "NONE":
      return [];
    default:
      return [];
  }
}

function normalizeBlocks(blocks: unknown[]): BaseBlock[] {
  return blocks
    .filter((block): block is Record<string, unknown> => Boolean(block) && typeof block === "object")
    .filter((block) => typeof block.type === "string" && block.type !== "none")
    .map((block) => ({
      ...block,
      metadata: {
        serviceId: "",
        serviceName: "",
        variantName: "",
        ...((block.metadata && typeof block.metadata === "object"
          ? block.metadata
          : {}) as Record<string, unknown>),
      },
    })) as BaseBlock[];
}

function attachToBlock(contract: ClaudiaContract, layout: BaseBlock[]): BlockTypes | undefined {
  const firstType = layout[0]?.type;
  if (firstType && firstType !== "none") return firstType;
  if (contract.nextAction.type === "ASK_CLARIFICATION" || contract.nextAction.type === "NONE") {
    return undefined;
  }
  return firstType && firstType !== "none" ? firstType : undefined;
}

export function claudiaContractToLegacyResponse(contract: ClaudiaContract): LegacyClaudiaResponse {
  const layout = contract.ui.blocks.length
    ? normalizeBlocks(contract.ui.blocks)
    : blocksFromNextAction(contract);
  const attach = attachToBlock(contract, layout);
  const message: TextMessage = {
    role: "assistant",
    content: contract.message,
    attachToBlockType: attach,
  } as TextMessage;
  const legacyIntent = compactUndefined({
    type: contract.intent.type ?? intentTypeFromContract(contract),
    ...contract.intent.entities,
  }) as Record<string, unknown>;

  return {
    messages: contract.message ? [message] : [],
    layout,
    intent: legacyIntent,
  };
}

function intentTypeFromContract(contract: ClaudiaContract): ClaudiaIntent | string {
  if (contract.kind === "booking_result") return "booking";
  if (contract.kind === "appointments") return "appointments";
  if (contract.kind === "prices") return "prices";
  if (contract.kind === "auth") return "login";
  if (contract.kind === "recovery" && contract.nextAction.type === "SHOW_RECOVERY_ALTERNATIVES") {
    return "booking_conflict";
  }
  if (contract.kind === "recovery") return "recover_missing_salon";
  return contract.workflow.domain;
}

function kindFromLegacy(response: LegacyClaudiaResponse): ClaudiaContract["kind"] {
  const firstBlockType = response.layout?.[0]?.type;
  const intentType = String(response.intent?.type ?? "");
  if (firstBlockType === "AppointmentCalendarBlock") {
    return intentType === "booking_conflict" ? "recovery" : "booking_result";
  }
  if (firstBlockType === "CalendarBlock" || intentType === "appointments") return "appointments";
  if (firstBlockType === "ServicePriceBlock" || firstBlockType === "SalonListBlock" || intentType === "prices") {
    return "prices";
  }
  if (firstBlockType === "AuthBlock" || intentType === "login" || intentType === "login_for_booking") return "auth";
  if (firstBlockType === "AppointmentCancelConfirmBlock") return "confirmation";
  return response.messages?.[0]?.content ? "clarification" : "unknown";
}

function workflowDomainFromKind(kind: ClaudiaContract["kind"]): ClaudiaContract["workflow"]["domain"] {
  if (kind === "booking_result") return "booking";
  if (kind === "appointments" || kind === "confirmation") return "appointments";
  if (kind === "prices") return "prices";
  if (kind === "auth") return "auth";
  if (kind === "recovery") return "recovery";
  return "unknown";
}

function nextActionFromLegacy(response: LegacyClaudiaResponse): ClaudiaContract["nextAction"]["type"] {
  const firstBlockType = response.layout?.[0]?.type;
  const intentType = String(response.intent?.type ?? "");
  if (firstBlockType === "AppointmentCalendarBlock") {
    return intentType === "booking_conflict" ? "SHOW_RECOVERY_ALTERNATIVES" : "SHOW_SLOTS";
  }
  if (firstBlockType === "CalendarBlock") return "SHOW_APPOINTMENTS";
  if (firstBlockType === "ServicePriceBlock") return "SHOW_PRICES";
  if (firstBlockType === "SalonListBlock") return intentType === "prices" ? "SHOW_PRICES" : "SHOW_SALONS";
  if (firstBlockType === "AuthBlock") return "SHOW_AUTH";
  if (firstBlockType === "AppointmentCancelConfirmBlock") return "SHOW_CANCEL_CONFIRMATION";
  return response.messages?.[0]?.content ? "ASK_CLARIFICATION" : "NONE";
}

function entitiesFromLegacy(response: LegacyClaudiaResponse): ClaudiaContract["intent"]["entities"] {
  const firstMetadata = response.layout?.[0]?.metadata ?? {};
  return ClaudiaEntitiesSchema.parse({
    ...response.intent,
    ...firstMetadata,
  });
}

export function legacyClaudiaResponseToContract(response: LegacyClaudiaResponse): ClaudiaContract {
  const kind = kindFromLegacy(response);
  const nextActionType = nextActionFromLegacy(response);
  const message = response.messages?.[0]?.content ?? "";
  const blocks = normalizeBlocks(response.layout ?? []) as unknown as ClaudiaContract["ui"]["blocks"];

  return {
    kind,
    message,
    workflow: {
      domain: workflowDomainFromKind(kind),
      step: String(response.intent?.type ?? nextActionType.toLowerCase()),
      status: nextActionType === "ASK_CLARIFICATION" ? "waiting_for_user" : "ready",
    },
    nextAction: {
      type: nextActionType,
      reason: "legacy_response",
    },
    ui: {
      blocks,
      hideBlocks: [],
      showBlocks: [],
      focusBlock: blocks[0]?.type,
    },
    intent: {
      type: typeof response.intent?.type === "string" ? response.intent.type : undefined,
      confidence: 1,
      entities: entitiesFromLegacy(response),
      missingFields: [],
    },
  };
}

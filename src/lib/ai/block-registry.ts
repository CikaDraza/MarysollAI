// src/lib/ai/block-registry.ts
//
// Phase 2 — Block routing registry.
//
// Single source of truth for everything *about* a block that isn't its
// rendered output:
//   - the workspace header label,
//   - the "Pitaj AI" follow-up question,
//   - the metadata fields a block requires to be useful,
//   - the agent type that owns it,
//   - a default priority.
//
// Previously these lived in three places (AIWorkspace.BLOCK_LABELS,
// LayoutEngine.AI_FOLLOWUPS, ad-hoc `if (!city) → CityListBlock` lanci
// po askAgent.ts). When a block was added or renamed, all three had to
// be touched and inevitably drifted out of sync.
//
// Invariant preserved: onClick → message → orchestrator → registry →
// LayoutEngine. The registry sits inside the orchestrator pipeline; it
// does not bypass it.
import type { BaseBlock, BlockTypes } from "@/types/landing-block";

/** Which top-level agent owns this block. Used by future routing logic
 * (e.g. blockOrchestrator policies, debug logs, agent-specific styling). */
export type BlockAgentType =
  | "booking"
  | "auth"
  | "prices"
  | "appointments"
  | "testimonials"
  | "other";

export interface BlockEntry {
  /** Block type discriminator — matches BaseBlock.type. */
  type: BlockTypes;
  /** Header label shown in AIWorkspace. */
  label: string;
  /** Owning agent. */
  agentType: BlockAgentType;
  /** Default render priority. Lower renders first (matches LayoutEngine sort). */
  priority: number;
  /** Optional follow-up question rendered as the "Pitaj AI" chip. */
  followUp?: string;
  /** Metadata keys that must be present (non-empty) for the block to be
   * meaningful. LayoutEngine refuses to mount a block missing any of these
   * — instead of showing an empty calendar / salon list. */
  requires?: Array<keyof BaseBlock["metadata"]>;
}

/** Canonical block table. Edit here, nowhere else. */
export const BLOCK_REGISTRY: Record<Exclude<BlockTypes, "none">, BlockEntry> = {
  AuthBlock: {
    type: "AuthBlock",
    label: "Prijava",
    agentType: "auth",
    priority: 1,
    followUp: "Imam problem sa prijavom, treba mi pomoć",
  },
  LoginBlock: {
    type: "LoginBlock",
    label: "Prijava",
    agentType: "auth",
    priority: 1,
  },
  LogoutBlock: {
    type: "LogoutBlock",
    label: "Odjava",
    agentType: "auth",
    priority: 1,
  },
  RegisterBlock: {
    type: "RegisterBlock",
    label: "Registracija",
    agentType: "auth",
    priority: 1,
  },
  ForgotPasswordBlock: {
    type: "ForgotPasswordBlock",
    label: "Zaboravljena lozinka",
    agentType: "auth",
    priority: 1,
  },
  ResetPasswordBlock: {
    type: "ResetPasswordBlock",
    label: "Nova lozinka",
    agentType: "auth",
    priority: 1,
  },
  ServicePriceBlock: {
    type: "ServicePriceBlock",
    label: "Cenovnik",
    agentType: "prices",
    priority: 2,
    followUp: "Koji tretman preporučuješ za opuštanje?",
  },
  AppointmentCalendarBlock: {
    type: "AppointmentCalendarBlock",
    label: "Zakazivanje",
    agentType: "booking",
    priority: 1,
    followUp: "Preporuči mi slobodan termin za ovu nedelju",
    // Without slots there's nothing to show. service/city are useful but
    // not strictly required (Claudia may pre-fill from the search result).
    requires: ["slots"],
  },
  AppointmentCancelConfirmBlock: {
    type: "AppointmentCancelConfirmBlock",
    label: "Otkazivanje",
    agentType: "appointments",
    priority: 1,
    requires: ["appointmentId"],
  },
  CalendarBlock: {
    type: "CalendarBlock",
    label: "Termini",
    agentType: "appointments",
    priority: 1,
    followUp: "Koji termini su slobodni ove sedmice?",
  },
  CityListBlock: {
    type: "CityListBlock",
    label: "Izaberi grad",
    agentType: "booking",
    priority: 1,
  },
  SalonListBlock: {
    type: "SalonListBlock",
    label: "Izaberi salon",
    agentType: "booking",
    priority: 1,
    requires: ["city"],
  },
  TestimonialBlock: {
    type: "TestimonialBlock",
    label: "Utisci",
    agentType: "testimonials",
    priority: 3,
    followUp: "Prikaži mi najnovije utiske klijenata",
  },
  WhyChooseUsBlock: {
    type: "WhyChooseUsBlock",
    label: "Zašto Marysoll",
    agentType: "other",
    priority: 4,
  },
  NewsletterFormBlock: {
    type: "NewsletterFormBlock",
    label: "Newsletter",
    agentType: "other",
    priority: 5,
  },
};

/** Lookup helper. Returns undefined for "none" or unknown types. */
export function getBlockEntry(type: BlockTypes): BlockEntry | undefined {
  if (type === "none") return undefined;
  return BLOCK_REGISTRY[type];
}

/** Workspace header label. Falls back to a generic string so the header
 * is never empty if a new block lands without a registry entry. */
export function getBlockLabel(type: BlockTypes): string {
  return getBlockEntry(type)?.label ?? "AI asistent";
}

/** "Pitaj AI" chip question for this block, if any. */
export function getBlockFollowUp(type: BlockTypes): string | undefined {
  return getBlockEntry(type)?.followUp;
}

/** True iff `block.metadata` carries every key the registry marks as required.
 * Used by LayoutEngine to skip mounting incomplete blocks (e.g. an
 * AppointmentCalendarBlock with no slots) instead of rendering an empty shell. */
export function blockHasRequiredMetadata(block: BaseBlock): boolean {
  const entry = getBlockEntry(block.type);
  if (!entry?.requires?.length) return true;
  const meta = block.metadata as Record<string, unknown> | undefined;
  if (!meta) return false;
  return entry.requires.every((key) => {
    const value = meta[key as string];
    if (value === undefined || value === null) return false;
    if (typeof value === "string" && value.trim() === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  });
}

/** Minimal intent → block routing table. Used by askAgent.ts to centralise
 * the repeated "missing field → ask via list block" patterns (prices,
 * select_city, recover_missing_salon). Returns the block type that should
 * be shown when the named field is missing, or null when the intent
 * doesn't have a routing rule for that missing field. */
export type IntentMissingField = "city" | "service" | "salon";

const INTENT_MISSING_FIELD_BLOCKS: Record<
  string,
  Partial<Record<IntentMissingField, BlockTypes>>
> = {
  booking: { city: "CityListBlock", salon: "SalonListBlock" },
  prices: { city: "CityListBlock" },
  select_city: { city: "CityListBlock" },
  recover_missing_salon: { salon: "SalonListBlock" },
};

export function chooseBlockForMissingField(
  intent: string,
  missing: IntentMissingField,
): BlockTypes | null {
  return INTENT_MISSING_FIELD_BLOCKS[intent]?.[missing] ?? null;
}

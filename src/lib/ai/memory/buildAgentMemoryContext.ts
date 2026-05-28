import type {
  AgentMemoryContext,
  EpisodicMemory,
  SemanticMemory,
  WorkingMemory,
} from "./agent-memory-types";
import { getEpisodicMemorySnapshot } from "./episodic-session-store";
import { getProceduralMemory } from "./procedural-memory";

export interface BuildAgentMemoryContextInput {
  activeAgent?: string;
  bookingWorkflowStep?: string;
  bookingFlowCollected?: Record<string, unknown>;
  selectedSlot?: Record<string, unknown> | null;
  pendingBooking?: Record<string, unknown> | null;
  lastSystemAction?: string;
  lastRecoveryReason?: string;
  lastAssistantMessage?: string;
  contactRequired?: boolean;
  salonRequired?: boolean;
  semanticMemory?: SemanticMemory;
  episodicMemory?: EpisodicMemory;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asHour(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function compactCollected(
  collected: Record<string, unknown> | undefined,
): WorkingMemory["collected"] {
  if (!collected) return undefined;
  const next = {
    city: asString(collected.city) ?? asString(collected.requestedCity),
    service: asString(collected.service) ?? asString(collected.serviceName),
    category: asString(collected.category),
    salonId: asString(collected.salonId),
    salonName: asString(collected.salonName),
    date: asString(collected.date),
    time: asString(collected.time),
    timeWindowStart: asHour(collected.timeWindowStart),
    timeWindowEnd: asHour(collected.timeWindowEnd),
  };
  return Object.fromEntries(
    Object.entries(next).filter(([, value]) => value !== undefined && value !== ""),
  ) as WorkingMemory["collected"];
}

function hasTime(collected: WorkingMemory["collected"]): boolean {
  return Boolean(
    collected?.time ||
      collected?.timeWindowStart != null ||
      collected?.timeWindowEnd != null,
  );
}

function hasCollectedValue(collected: WorkingMemory["collected"]): boolean {
  return Boolean(collected && Object.keys(collected).length > 0);
}

function deriveMissingFields(input: {
  collected: WorkingMemory["collected"];
  workflowStep?: string;
  selectedSlot?: Record<string, unknown> | null;
  pendingBooking?: Record<string, unknown> | null;
  contactRequired?: boolean;
  salonRequired?: boolean;
}): string[] {
  const missing: string[] = [];
  const { collected } = input;
  const hasBookingSignal = Boolean(
    hasCollectedValue(collected) ||
      input.selectedSlot ||
      input.pendingBooking ||
      input.contactRequired ||
      input.salonRequired ||
      (input.workflowStep && input.workflowStep !== "idle"),
  );

  if (!hasBookingSignal) return missing;

  if (!collected?.service) missing.push("service");
  if (!collected?.city) missing.push("city");
  if (!collected?.date) missing.push("date");
  if (!hasTime(collected)) missing.push("time");
  if (input.salonRequired && !collected?.salonId && !collected?.salonName) {
    missing.push("salon");
  }
  if (input.contactRequired) {
    const contact =
      input.pendingBooking?.contact ??
      input.selectedSlot?.contact;
    if (!contact) missing.push("contact");
  }

  return missing;
}

export function buildAgentMemoryContext(
  input: BuildAgentMemoryContextInput = {},
): AgentMemoryContext {
  const collected = compactCollected(input.bookingFlowCollected);
  const workingMemory: WorkingMemory = {
    activeAgent: input.activeAgent,
    workflowStep: input.bookingWorkflowStep,
    collected,
    selectedSlot: input.selectedSlot ?? null,
    pendingBooking: input.pendingBooking ?? null,
    missingFields: deriveMissingFields({
      collected,
      workflowStep: input.bookingWorkflowStep,
      selectedSlot: input.selectedSlot,
      pendingBooking: input.pendingBooking,
      contactRequired: input.contactRequired,
      salonRequired: input.salonRequired,
    }),
    lastSystemAction: input.lastSystemAction,
    lastRecoveryReason: input.lastRecoveryReason,
    lastAssistantMessage: input.lastAssistantMessage,
  };

  return {
    workingMemory,
    proceduralMemory: getProceduralMemory(),
    semanticMemory: input.semanticMemory,
    episodicMemory: input.episodicMemory ?? getEpisodicMemorySnapshot(),
  };
}

import { bookingFlow } from "@/lib/ai/booking-flow-state";
import { chatEvents } from "@/lib/ai/events/chatEvents";
import {
  normalizeBookingPayload,
  validateBookingPayload,
  type BookingModalSlot,
} from "@/lib/booking/bookingPayload";
import { executeUICommand } from "@/lib/ai/ui/ui-command-executor";
import { handleRecoveryEvent } from "@/lib/ai/recovery/recovery-engine";
import type { RecoveryReason, RecoverySeverity } from "@/lib/ai/recovery/recovery-types";
import { bookingWorkflow } from "@/lib/ai/workflow/booking-workflow-store";
import {
  SystemActionEventSchema,
  type SystemActionEvent,
  type SystemActionName,
  type SystemActionSource,
} from "@/lib/ai/events/chat-event-types";
import type { ClaudiaSubAgent } from "@/store/ai/agent-state";
import type { SearchResult } from "@/types/slots";

export type SystemActionInput = Omit<
  SystemActionEvent,
  "type" | "timestamp" | "visibleInThread"
> & {
  visibleInThread?: false;
  timestamp?: number;
};

export interface SystemActionAgentRequest {
  agentType: ClaudiaSubAgent;
  input: string;
  handoffPayload: Record<string, unknown>;
}

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

function payloadKeys(payload?: Record<string, unknown>): string[] {
  return payload ? Object.keys(payload) : [];
}

function logEvent(
  label: "[SYSTEM_ACTION]" | "[EVENT_ROUTED]" | "[EVENT_IGNORED]" | "[LEGACY_ACTION_TEXT]",
  event: Pick<SystemActionEvent, "action" | "source" | "notifyAgent" | "visibleInThread" | "payload">,
  extra?: Record<string, unknown>,
): void {
  if (!isDev()) return;
  const details = {
    action: event.action,
    source: event.source,
    notifyAgent: event.notifyAgent ?? false,
    visibleInThread: event.visibleInThread,
    payloadKeys: payloadKeys(event.payload),
    ...extra,
  };
  if (label === "[LEGACY_ACTION_TEXT]") {
    console.warn(label, details);
    return;
  }
  console.debug(label, details);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function selectedSlotFromPayload(payload?: Record<string, unknown>): SearchResult | undefined {
  const slot = payload?.selectedSlot;
  if (slot && typeof slot === "object") return slot as SearchResult;
  return undefined;
}

function slotFromPayload(payload?: Record<string, unknown>): BookingModalSlot | undefined {
  const slot = payload?.selectedSlot ?? payload?.pendingBooking;
  if (slot && typeof slot === "object") return slot as BookingModalSlot;
  return undefined;
}

function isValidBookingSlot(slot: BookingModalSlot | undefined): boolean {
  if (!slot) return false;
  const normalized = normalizeBookingPayload(slot);
  return validateBookingPayload(normalized).ok;
}

function missingFieldsForSlot(slot: BookingModalSlot | undefined): string[] {
  if (!slot) return ["selectedSlot"];
  return validateBookingPayload(normalizeBookingPayload(slot)).missingFields;
}

function recoveryReasonFromMissingFields(missingFields: string[]): RecoveryReason {
  if (missingFields.includes("contact")) return "missing_contact";
  if (missingFields.includes("salonId") || missingFields.includes("salonName")) {
    return "missing_salon";
  }
  if (
    missingFields.includes("startTime") ||
    missingFields.includes("date") ||
    missingFields.includes("time")
  ) {
    return "missing_start_time";
  }
  if (missingFields.includes("serviceId") || missingFields.includes("serviceName")) {
    return "missing_service";
  }
  return "unknown";
}

function severityForRecovery(reason: RecoveryReason): RecoverySeverity {
  if (reason === "missing_contact" || reason === "notify_created") return "info";
  if (reason === "booking_submit_failed" || reason === "unknown") return "blocking";
  if (reason === "cancel_expired") return "blocking";
  return "recoverable";
}

function collectSelectedSlot(slot: SearchResult): void {
  bookingFlow.get().collect({
    category: slot.category,
    service: slot.serviceName,
    serviceId: slot.serviceId ?? undefined,
    serviceName: slot.serviceName,
    city: slot.city,
    salonId: slot.salonId ?? undefined,
    salonName: slot.salonName ?? undefined,
    date: slot.startTime?.split("T")[0],
    time: slot.timeLabel,
  });
  bookingFlow.get().setState("reviewing_slots");
}

function applyLocalWorkflowEffects(event: SystemActionEvent): void {
  if (event.action === "SLOT_SELECTED") {
    const slot = selectedSlotFromPayload(event.payload);
    if (slot) collectSelectedSlot(slot);
    return;
  }

  if (event.action === "BOOKING_SUBMIT_STARTED") {
    bookingFlow.get().setState("confirming");
    return;
  }

  if (event.action === "BOOKING_SUBMIT_SUCCESS") {
    bookingFlow.get().setState("completed");
  }
}

/** Task 6 — the booking workflow state machine cares about a fixed subset
 * of SystemActionEvents. Any event in this set is forwarded to
 * `bookingWorkflow.transition()` so the state machine can advance and,
 * for high-risk transitions, emit its own UI commands (deduped against
 * the dispatcher's by the executor's soft ownership). */
const BOOKING_WORKFLOW_ACTIONS: ReadonlySet<SystemActionName> = new Set([
  "SLOT_SELECTED",
  "BOOKING_MODAL_OPENED",
  "BOOKING_MODAL_CLOSED",
  "BOOKING_PAYLOAD_INCOMPLETE",
  "BOOKING_SUBMIT_STARTED",
  "BOOKING_SUBMIT_SUCCESS",
  "BOOKING_SUBMIT_FAILED",
  "BOOKING_CONFLICT",
  "LOGIN_REQUIRED",
  "LOGIN_SUCCESS",
  "AUTH_RESUME_BOOKING",
  "NOTIFY_ME_CREATED",
]);

function applyBookingWorkflowEffects(event: SystemActionEvent): void {
  if (!BOOKING_WORKFLOW_ACTIONS.has(event.action)) return;
  bookingWorkflow.transition(event);
}

function emitIncompletePayloadEvent(
  source: SystemActionSource,
  selectedSlot: BookingModalSlot | undefined,
  missingFields: string[],
): void {
  const incompleteEvent: SystemActionEvent = {
    type: "system_action",
    action: "BOOKING_PAYLOAD_INCOMPLETE",
    source,
    payload: {
      selectedSlot,
      missingFields,
    },
    notifyAgent: true,
    visibleInThread: false,
    timestamp: Date.now(),
  };
  logEvent("[SYSTEM_ACTION]", incompleteEvent);
  applyBookingWorkflowEffects(incompleteEvent);
  handleRecoveryFromSystemAction(incompleteEvent);
  chatEvents.emit(incompleteEvent);
}

function handleRecoveryFromSystemAction(event: SystemActionEvent): void {
  let reason: RecoveryReason | null = null;
  if (event.action === "BOOKING_CONFLICT") reason = "slot_taken";
  if (event.action === "BOOKING_SUBMIT_FAILED") reason = "booking_submit_failed";
  if (event.action === "LOGIN_REQUIRED") reason = "auth_required";
  if (event.action === "NOTIFY_ME_CREATED") reason = "notify_created";
  if (event.action === "BOOKING_PAYLOAD_INCOMPLETE") {
    const fields = Array.isArray(event.payload?.missingFields)
      ? event.payload.missingFields.map(String)
      : [];
    reason = recoveryReasonFromMissingFields(fields);
  }
  if (!reason) return;

  handleRecoveryEvent({
    type: "recovery",
    reason,
    severity: severityForRecovery(reason),
    source: "SystemActionDispatcher",
    payload: {
      ...event.payload,
      systemActionAlreadyEmitted: true,
    },
    notifyAgent: event.notifyAgent,
    visibleInThread: false,
    timestamp: Date.now(),
  });
}

function applyUICommandEffects(event: SystemActionEvent): void {
  const slot = slotFromPayload(event.payload);

  if (event.action === "SLOT_SELECTED") {
    if (isValidBookingSlot(slot)) {
      executeUICommand({
        type: "OPEN_BOOKING_MODAL",
        payload: slot!,
        reason: "slot_selected",
      });
      return;
    }
    emitIncompletePayloadEvent(event.source, slot, missingFieldsForSlot(slot));
    return;
  }

  if (event.action === "LOGIN_SUCCESS") {
    const pendingBooking = slotFromPayload(event.payload);
    if (isValidBookingSlot(pendingBooking)) {
      executeUICommand({
        type: "OPEN_BOOKING_MODAL",
        payload: pendingBooking!,
        reason: "login_success_pending_booking",
      });
    }
  }
}

export function systemActionToAgentRequest(
  event: SystemActionEvent,
): SystemActionAgentRequest | null {
  const payload = event.payload ?? {};

  if (event.action === "BOOKING_CONFLICT") {
    return {
      agentType: "booking",
      input: "system_action:BOOKING_CONFLICT",
      handoffPayload: {
        intent: "booking_conflict",
        ...payload,
      },
    };
  }

  if (event.action === "BOOKING_PAYLOAD_INCOMPLETE") {
    const selectedSlot = selectedSlotFromPayload(payload);
    const requestedIntent = asString(payload.intent);
    const service =
      asString(payload.serviceName) ??
      asString(payload.service) ??
      selectedSlot?.serviceName ??
      "";
    const city = asString(payload.city) ?? selectedSlot?.city ?? "";
    const date =
      asString(payload.date) ?? selectedSlot?.startTime?.split("T")[0] ?? "";
    const time = asString(payload.time) ?? selectedSlot?.timeLabel ?? "";
    const salons = Array.isArray(payload.salons) ? payload.salons : undefined;
    const missingFields = Array.isArray(payload.missingFields)
      ? payload.missingFields.map(String)
      : [];
    const missingSalon =
      missingFields.includes("salonId") || missingFields.includes("salonName");

    if (requestedIntent === "recover_missing_salon" || (missingSalon && salons && salons.length > 0)) {
      return {
        agentType: "booking",
        input: "system_action:BOOKING_PAYLOAD_INCOMPLETE",
        handoffPayload: {
          intent: "recover_missing_salon",
          city,
          service,
          date,
          time,
          salons,
        },
      };
    }

    if (requestedIntent === "no_slots") {
      return {
        agentType: "booking",
        input: "system_action:BOOKING_PAYLOAD_INCOMPLETE",
        handoffPayload: {
          intent: "no_slots",
          selectedSlot,
          service,
          city,
          date,
          time,
        },
      };
    }

    return {
      agentType: "booking",
      input: "system_action:BOOKING_PAYLOAD_INCOMPLETE",
      handoffPayload: {
        intent: "booking",
        service,
        city,
        date,
        time,
      },
    };
  }

  if (event.action === "LOGIN_SUCCESS") {
    const pendingBooking = payload.pendingBooking ?? payload.selectedSlot;
    if (!pendingBooking) return null;
    return {
      agentType: "booking",
      input: "system_action:LOGIN_SUCCESS",
      handoffPayload: {
        intent: "resume_booking_after_login",
        selectedSlot: pendingBooking,
      },
    };
  }

  if (event.action === "LOGIN_REQUIRED") {
    return {
      agentType: "auth",
      input: "system_action:LOGIN_REQUIRED",
      handoffPayload: {
        intent: "login_for_booking",
        selectedSlot: payload.selectedSlot,
      },
    };
  }

  if (event.action === "CITY_SELECTED") {
    return {
      agentType: "booking",
      input: "system_action:CITY_SELECTED",
      handoffPayload: {
        intent: "select_city",
        city: payload.city,
        service: payload.service,
        category: payload.category,
        date: payload.date,
        time: payload.time,
        timeWindowStart: payload.timeWindowStart,
        timeWindowEnd: payload.timeWindowEnd,
      },
    };
  }

  if (event.action === "SALON_SELECTED") {
    return {
      agentType: "booking",
      input: "system_action:SALON_SELECTED",
      handoffPayload: {
        intent: "select_salon",
        city: payload.city,
        service: payload.service,
        category: payload.category,
        salonId: payload.salonId,
        salonName: payload.salonName,
        date: payload.date,
        time: payload.time,
        timeWindowStart: payload.timeWindowStart,
        timeWindowEnd: payload.timeWindowEnd,
      },
    };
  }

  return null;
}

export function sendSystemAction(input: SystemActionInput): SystemActionEvent | null {
  const event: SystemActionEvent = {
    ...input,
    type: "system_action",
    visibleInThread: false,
    timestamp: input.timestamp ?? Date.now(),
  };

  const parsed = SystemActionEventSchema.safeParse(event);
  if (!parsed.success) {
    if (isDev()) {
      console.warn("[EVENT_IGNORED]", {
        reason: "invalid_system_action",
        action: input.action,
        source: input.source,
        issues: parsed.error.issues.map((issue) => issue.message),
      });
    }
    return null;
  }

  const safeEvent = parsed.data;
  logEvent("[SYSTEM_ACTION]", safeEvent);
  applyLocalWorkflowEffects(safeEvent);
  applyUICommandEffects(safeEvent);
  handleRecoveryFromSystemAction(safeEvent);
  applyBookingWorkflowEffects(safeEvent);
  chatEvents.emit(safeEvent);
  return safeEvent;
}

export function legacyActionTextToSystemAction(
  text: string,
  source: SystemActionSource = "Unknown",
): SystemActionEvent | null {
  const normalized = text.trim();
  const build = (
    action: SystemActionName,
    payload?: Record<string, unknown>,
    notifyAgent = true,
  ) =>
    sendSystemAction({
      action,
      source,
      payload,
      notifyAgent,
    });

  if (/^ZAKAZANO\b/i.test(normalized)) {
    return build("BOOKING_SUBMIT_SUCCESS", { legacyText: text });
  }
  if (/USPEŠNA PRIJAVA|USPESNA PRIJAVA/i.test(normalized)) {
    return build("LOGIN_SUCCESS", { legacyText: text });
  }
  if (/GREŠKA:\s*Korisnik nije prijavljen|GRESKA:\s*Korisnik nije prijavljen/i.test(normalized)) {
    return build("LOGIN_REQUIRED", { legacyText: text });
  }
  if (/termin.*zauzet|SLOT_TAKEN|conflict/i.test(normalized)) {
    return build("BOOKING_CONFLICT", { legacyText: text });
  }

  logEvent(
    "[LEGACY_ACTION_TEXT]",
    {
      action: "BOOKING_SUBMIT_FAILED",
      source,
      notifyAgent: false,
      visibleInThread: false,
      payload: { text },
    },
    { preservedOldBehavior: true },
  );
  return null;
}

export { logEvent as logSystemActionEvent };

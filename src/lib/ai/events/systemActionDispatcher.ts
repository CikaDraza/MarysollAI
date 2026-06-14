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
import { recordEpisodicSystemAction } from "@/lib/ai/memory/episodic-session-store";
import { systemActionToDisplayMessage } from "@/lib/ai/events/systemActionDisplay";
import {
  isBlockConsumed,
  markBlockConsumed,
} from "@/lib/ai/layout/block-lifecycle";
import {
  SystemActionEventSchema,
  type SystemActionEvent,
  type SystemActionName,
  type SystemActionSource,
} from "@/lib/ai/events/chat-event-types";
import type { ClaudiaSubAgent } from "@/store/ai/agent-state";
import type { SearchResult } from "@/types/slots";
import type { IAppointment } from "@/types/appointments-type";
import type { BaseBlock } from "@/types/landing-block";
import { rescheduleFlow } from "@/lib/ai/reschedule-flow-state";

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

const BOOKING_REPLAY_GUARDED_ACTIONS: ReadonlySet<SystemActionName> = new Set([
  "CITY_SELECTED",
  "SALON_SELECTED",
  "SERVICE_SELECTED_FOR_SALON",
  "SLOT_SELECTED",
  "BOOKING_PAYLOAD_INCOMPLETE",
  "BOOKING_CONFLICT",
  "BOOKING_SUBMIT_STARTED",
  "BOOKING_SUBMIT_SUCCESS",
]);

const dispatchedActionIds = new Set<string>();
const routedActionIds = new Set<string>();

function createActionId(action: SystemActionName): string {
  return `${action}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function readFlowVersion(payload?: Record<string, unknown>): number | undefined {
  return typeof payload?.flowVersion === "number" ? payload.flowVersion : undefined;
}

function withBookingFlowVersion(event: SystemActionEvent): SystemActionEvent {
  if (!BOOKING_REPLAY_GUARDED_ACTIONS.has(event.action)) return event;
  const payload = event.payload ?? {};
  if (typeof payload.flowVersion === "number") return event;
  return {
    ...event,
    payload: {
      ...payload,
      flowVersion: bookingFlow.get().flowVersion,
    },
  };
}

function isStaleBookingAction(event: SystemActionEvent): boolean {
  if (!BOOKING_REPLAY_GUARDED_ACTIONS.has(event.action)) return false;
  const eventVersion = readFlowVersion(event.payload);
  if (eventVersion == null) return false;
  return eventVersion < bookingFlow.get().flowVersion;
}

function sourceBlockId(payload?: Record<string, unknown>): string | undefined {
  return typeof payload?.sourceBlockId === "string" ? payload.sourceBlockId : undefined;
}

function sourceBlockType(payload?: Record<string, unknown>): string | undefined {
  return typeof payload?.sourceBlockType === "string" ? payload.sourceBlockType : undefined;
}

function shouldConsumeSourceBlock(action: SystemActionName): boolean {
  return (
    action === "CITY_SELECTED" ||
    action === "SALON_SELECTED" ||
    action === "SERVICE_SELECTED_FOR_SALON" ||
    action === "SLOT_SELECTED" ||
    action === "LOGIN_SUCCESS" ||
    action === "BOOKING_SUBMIT_SUCCESS"
  );
}

function consumeSourceBlock(event: SystemActionEvent): void {
  if (!shouldConsumeSourceBlock(event.action)) return;
  const blockId = sourceBlockId(event.payload);
  if (!blockId) return;
  markBlockConsumed(
    blockId,
    event.action.toLowerCase(),
    event.actionId,
    sourceBlockType(event.payload) ?? "unknown",
  );
}

export function shouldIgnoreSystemActionForRouting(event: SystemActionEvent): boolean {
  if (event.actionId) {
    if (routedActionIds.has(event.actionId)) {
      console.debug("[DUPLICATE_SYSTEM_ACTION_IGNORED]", {
        action: event.action,
        actionId: event.actionId,
        payloadKeys: payloadKeys(event.payload),
      });
      return true;
    }
    routedActionIds.add(event.actionId);
  }

  if (isStaleBookingAction(event)) {
    console.debug("[STALE_BOOKING_ACTION_IGNORED]", {
      action: event.action,
      actionId: event.actionId,
      eventFlowVersion: readFlowVersion(event.payload),
      currentFlowVersion: bookingFlow.get().flowVersion,
      payloadKeys: payloadKeys(event.payload),
    });
    return true;
  }

  return false;
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
  // Do not pollute bookingFlow while an appointment reschedule is in progress.
  if (rescheduleFlow.get().active) return;
  bookingFlow.get().bumpFlowVersion("slot_selected");
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

function collectServiceSelectedForSalon(payload?: Record<string, unknown>): void {
  if (!payload) return;
  if (rescheduleFlow.get().active) return;
  bookingFlow.get().bumpFlowVersion("service_selected_for_salon");
  bookingFlow.get().collect({
    city: asString(payload.city),
    salonId: asString(payload.salonId),
    salonName: asString(payload.salonName),
    serviceId: asString(payload.serviceId),
    serviceName: asString(payload.serviceName),
    service: asString(payload.serviceName) ?? asString(payload.service),
    category: asString(payload.category),
    subcategory: asString(payload.subcategory),
    date: asString(payload.date),
    time: asString(payload.time),
    timeWindowStart:
      typeof payload.timeWindowStart === "number"
        ? payload.timeWindowStart
        : payload.timeWindowStart === null
          ? null
          : undefined,
    timeWindowEnd:
      typeof payload.timeWindowEnd === "number"
        ? payload.timeWindowEnd
        : payload.timeWindowEnd === null
          ? null
          : undefined,
  });
  bookingFlow.get().setState("reviewing_slots");
  if (isDev()) {
    console.debug("[BOOKING_FLOW_COLLECT_SERVICE_SELECTED]", {
      payloadKeys: payloadKeys(payload),
      collectedAfter: bookingFlow.get().collected,
    });
  }
}

function applyLocalWorkflowEffects(event: SystemActionEvent): void {
  if (event.action === "SLOT_SELECTED") {
    const slot = selectedSlotFromPayload(event.payload);
    if (slot) collectSelectedSlot(slot);
    return;
  }

  if (event.action === "SERVICE_SELECTED_FOR_SALON") {
    collectServiceSelectedForSalon(event.payload);
    return;
  }

  if (event.action === "BOOKING_SUBMIT_STARTED") {
    bookingFlow.get().bumpFlowVersion("booking_submit_started");
    bookingFlow.get().setState("confirming");
    return;
  }

  if (event.action === "BOOKING_SUBMIT_SUCCESS") {
    bookingFlow.get().bumpFlowVersion("booking_submit_success");
    bookingFlow.get().setState("completed");
    return;
  }

  if (event.action === "APPOINTMENT_UPDATE_REQUESTED") {
    handleAppointmentUpdateRequested(event);
    return;
  }

  if (event.action === "APPOINTMENT_UPDATE_SLOT_SELECTED") {
    handleAppointmentUpdateSlotSelected(event);
    return;
  }

  if (event.action === "APPOINTMENT_UPDATE_SUCCESS") {
    rescheduleFlow.clear();
    // Replace the lingering confirm block with the refreshed appointments list
    // so the user lands back on "Moji termini" and sees the updated slot.
    renderAppointmentsList("appointment_update_success");
    return;
  }

  if (event.action === "APPOINTMENT_UPDATE_FAILED") {
    rescheduleFlow.clear();
    // Explicit cancel (Odustani) returns to the list; a real error leaves the
    // confirm block mounted so the user can retry.
    if (event.payload?.cancelled) {
      renderAppointmentsList("appointment_update_cancelled");
    }
    return;
  }
}

/** Render the "Moji termini" list as the workspace command block. Used after a
 * reschedule completes so the confirm block is replaced by the refreshed list. */
function renderAppointmentsList(reason: string): void {
  executeUICommand({
    type: "RENDER_BLOCK",
    block: {
      id: `appointments-list-${Date.now()}`,
      type: "CalendarBlock",
      priority: 1,
      metadata: {
        serviceId: "",
        serviceName: "",
        variantName: "",
        // Open directly on the "Moji Termini" tab (the list), not the default
        // "Kalendar"/salon-picker view — otherwise the post-reschedule landing
        // is confusing.
        mode: "list",
        appointmentListMode: "all",
      },
    } as unknown as BaseBlock,
    surface: "workspace",
    reason,
  });
}

function handleAppointmentUpdateRequested(event: SystemActionEvent): void {
  const appointment = event.payload?.appointment as IAppointment | undefined;
  const appointmentId = asString(event.payload?.appointmentId);
  if (!appointmentId || !appointment) return;

  // Prefer the resolved fields from the source block (ClientBlockAppointments
  // razrešava salon/uslugu preko salonDirectory) — sirovi appointment fildovi
  // su često prazni/objekti pa bi kalendar pao na missingSalon recovery.
  const salonId =
    asString(event.payload?.salonId) ||
    asString(appointment.salonId) ||
    asString(appointment.tenantId);
  const salonName =
    asString(event.payload?.salonName) || asString(appointment.salonName);
  const city =
    asString(event.payload?.salonCity) || asString(appointment.salonCity);
  const serviceId =
    asString(event.payload?.serviceId) ||
    asString(appointment.services?.[0]?.serviceId);
  const serviceName =
    asString(event.payload?.serviceName) || asString(appointment.serviceName);

  // Activate reschedule context so bookingFlow is not polluted during this flow.
  rescheduleFlow.start(appointmentId, appointment);

  // Open drawer so Claudia's response is visible.
  executeUICommand({ type: "OPEN_DRAWER", reason: "appointment_update_requested" });

  // Render the reschedule calendar directly in workspace so the user
  // doesn't have to wait for the LLM round-trip before seeing the UI.
  // Prefill only the service — date/time stay empty so the user consciously
  // picks a new slot (confirm is disabled until a time is chosen).
  executeUICommand({
    type: "RENDER_BLOCK",
    block: {
      id: `reschedule-${appointmentId}-${Date.now()}`,
      type: "AppointmentCalendarBlock",
      priority: 1,
      metadata: {
        serviceId,
        serviceName,
        variantName: "",
        city,
        salonId,
        salonName,
        rescheduleMode: true,
        currentAppointmentId: appointmentId,
        currentAppointment: appointment,
      },
    } as unknown as BaseBlock,
    surface: "workspace",
    reason: "appointment_update_requested",
  });
}

function handleAppointmentUpdateSlotSelected(event: SystemActionEvent): void {
  const appointment = event.payload?.currentAppointment as IAppointment | undefined;
  const appointmentId = asString(event.payload?.appointmentId);
  const newDate = asString(event.payload?.newDate);
  const newTime = asString(event.payload?.newTime);
  if (!appointmentId || !appointment || !newDate || !newTime) return;

  executeUICommand({
    type: "RENDER_BLOCK",
    block: {
      id: `update-confirm-${appointmentId}-${Date.now()}`,
      type: "AppointmentUpdateConfirmBlock",
      priority: 1,
      metadata: {
        serviceId: appointment.services?.[0]?.serviceId ?? "",
        serviceName: appointment.serviceName ?? "",
        variantName: "",
        appointmentId,
        currentAppointment: appointment,
        newDate,
        newTime,
        newStartTime: asString(event.payload?.newStartTime),
        newEndTime: asString(event.payload?.newEndTime),
        newSalonId: asString(event.payload?.salonId),
        newServiceId: asString(event.payload?.serviceId),
        newSalonName: asString(event.payload?.salonName),
        newServiceName: asString(event.payload?.serviceName),
      },
    } as unknown as BaseBlock,
    surface: "workspace",
    reason: "appointment_update_slot_selected",
  });
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
  const displayMessage = systemActionToDisplayMessage(event) ?? undefined;

  if (event.action === "BOOKING_CONFLICT") {
    return {
      agentType: "booking",
      input: "system_action:BOOKING_CONFLICT",
      handoffPayload: {
        intent: "booking_conflict",
        displayMessage,
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
          displayMessage,
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
          displayMessage,
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
        displayMessage,
        service,
        city,
        date,
        time,
      },
    };
  }

  if (event.action === "BOOKING_SUBMIT_SUCCESS") {
    return {
      agentType: "booking",
      input: "system_action:BOOKING_SUBMIT_SUCCESS",
      handoffPayload: {
        intent: "booking_success",
        displayMessage,
        ...payload,
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
        displayMessage,
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
        displayMessage,
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
        displayMessage,
        city: payload.city,
        service: payload.service,
        category: payload.category,
        date: payload.date,
        time: payload.time,
        timeWindowStart: payload.timeWindowStart,
        timeWindowEnd: payload.timeWindowEnd,
        flowVersion: payload.flowVersion,
      },
    };
  }

  if (event.action === "SALON_SELECTED") {
    return {
      agentType: "booking",
      input: "system_action:SALON_SELECTED",
      handoffPayload: {
        intent: "select_salon",
        displayMessage,
        city: payload.city,
        service: payload.service,
        category: payload.category,
        salonId: payload.salonId,
        salonName: payload.salonName,
        date: payload.date,
        time: payload.time,
        timeWindowStart: payload.timeWindowStart,
        timeWindowEnd: payload.timeWindowEnd,
        flowVersion: payload.flowVersion,
      },
    };
  }

  if (event.action === "APPOINTMENT_UPDATE_REQUESTED") {
    const appt = payload.appointment as IAppointment | undefined;
    return {
      agentType: "appointments",
      input: "system_action:APPOINTMENT_UPDATE_REQUESTED",
      handoffPayload: {
        intent: "update_appointment",
        appointmentId: payload.appointmentId,
        appointment: payload.appointment,
        salonName: appt?.salonName,
        serviceName: appt?.serviceName,
        displayMessage: appt?.serviceName
          ? `Možete izmeniti termin za ${appt.serviceName}${appt.salonName ? ` u ${appt.salonName}` : ""}. Izaberite novi datum i vreme. Salon i grad ne mogu se menjati.`
          : "Možete izmeniti datum i vreme termina. Salon i grad ne mogu se menjati.",
        rescheduleMode: true,
        lockedFields: ["salonId", "city"],
      },
    };
  }

  if (event.action === "SERVICE_SELECTED_FOR_SALON") {
    return {
      agentType: "booking",
      input: "system_action:SERVICE_SELECTED_FOR_SALON",
      handoffPayload: {
        intent: "select_salon",
        displayMessage,
        city: payload.city,
        service: payload.serviceName ?? payload.service,
        serviceId: payload.serviceId,
        serviceName: payload.serviceName,
        category: payload.category,
        subcategory: payload.subcategory,
        salonId: payload.salonId,
        salonName: payload.salonName,
        date: payload.date,
        time: payload.time,
        timeWindowStart: payload.timeWindowStart,
        timeWindowEnd: payload.timeWindowEnd,
        flowVersion: payload.flowVersion,
      },
    };
  }

  return null;
}

export function sendSystemAction(input: SystemActionInput): SystemActionEvent | null {
  const event: SystemActionEvent = {
    ...input,
    type: "system_action",
    actionId: input.actionId ?? createActionId(input.action),
    visibleInThread: false,
    timestamp: input.timestamp ?? Date.now(),
  };

  const parsed = SystemActionEventSchema.safeParse(withBookingFlowVersion(event));
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
  if (safeEvent.actionId) {
    if (dispatchedActionIds.has(safeEvent.actionId)) {
      console.debug("[DUPLICATE_SYSTEM_ACTION_IGNORED]", {
        action: safeEvent.action,
        actionId: safeEvent.actionId,
        payloadKeys: payloadKeys(safeEvent.payload),
      });
      return null;
    }
    dispatchedActionIds.add(safeEvent.actionId);
  }
  if (isStaleBookingAction(safeEvent)) {
    console.debug("[STALE_BOOKING_ACTION_IGNORED]", {
      action: safeEvent.action,
      actionId: safeEvent.actionId,
      eventFlowVersion: readFlowVersion(safeEvent.payload),
      currentFlowVersion: bookingFlow.get().flowVersion,
      payloadKeys: payloadKeys(safeEvent.payload),
    });
    return null;
  }
  const blockId = sourceBlockId(safeEvent.payload);
  if (blockId && isBlockConsumed(blockId)) {
    console.debug("[STALE_BLOCK_ACTION_IGNORED]", {
      action: safeEvent.action,
      actionId: safeEvent.actionId,
      sourceBlockId: blockId,
      sourceBlockType: sourceBlockType(safeEvent.payload),
      payloadKeys: payloadKeys(safeEvent.payload),
    });
    executeUICommand({
      type: "SHOW_TOAST",
      reason: "stale_block_action",
      message: "Ovaj izbor je već obrađen.",
      variant: "info",
    });
    return null;
  }
  if (
    safeEvent.action === "SERVICE_SELECTED_FOR_SALON" &&
    process.env.NODE_ENV !== "production"
  ) {
    console.debug("[SERVICE_SELECTED_FOR_SALON]", {
      payloadKeys: payloadKeys(safeEvent.payload),
    });
  }
  logEvent("[SYSTEM_ACTION]", safeEvent);
  applyLocalWorkflowEffects(safeEvent);
  consumeSourceBlock(safeEvent);
  recordEpisodicSystemAction(safeEvent);
  applyUICommandEffects(safeEvent);
  handleRecoveryFromSystemAction(safeEvent);
  applyBookingWorkflowEffects(safeEvent);
  const eventForEmit = BOOKING_REPLAY_GUARDED_ACTIONS.has(safeEvent.action)
    ? {
        ...safeEvent,
        payload: {
          ...(safeEvent.payload ?? {}),
          flowVersion: bookingFlow.get().flowVersion,
        },
      }
    : safeEvent;
  chatEvents.emit(eventForEmit);
  return eventForEmit;
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

import { bookingFlow } from "@/lib/ai/booking-flow-state";
import { chatEvents } from "@/lib/ai/events/chatEvents";
import type { SystemActionEvent, SystemActionName } from "@/lib/ai/events/chat-event-types";
import { executeUICommand } from "@/lib/ai/ui/ui-command-executor";
import type { UICommand } from "@/lib/ai/ui/ui-command-types";
import {
  buildBelgradeStartTime,
  normalizeBookingPayload,
  validateBookingPayload,
  type BookingModalSlot,
} from "@/lib/booking/bookingPayload";
import type { BaseBlock } from "@/types/landing-block";
import type { SearchResult } from "@/types/slots";
import type { RecoveryEvent, RecoveryReason } from "./recovery-types";

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

function payloadKeys(payload?: Record<string, unknown>): string[] {
  return payload ? Object.keys(payload) : [];
}

function logRecovery(
  label: "[RECOVERY_ENGINE]" | "[RECOVERY_UI]" | "[RECOVERY_AGENT]",
  event: RecoveryEvent,
  extra?: Record<string, unknown>,
): void {
  if (!isDev()) return;
  console.debug(label, {
    reason: event.reason,
    severity: event.severity,
    source: event.source,
    notifyAgent: event.notifyAgent ?? false,
    visibleInThread: event.visibleInThread,
    payloadKeys: payloadKeys(event.payload),
    ...extra,
  });
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asSlot(payload?: Record<string, unknown>): BookingModalSlot | undefined {
  const slot = payload?.selectedSlot ?? payload?.pendingBooking ?? payload?.slot;
  if (slot && typeof slot === "object") return slot as BookingModalSlot;
  return undefined;
}

function selectedSlotPayload(payload?: Record<string, unknown>): SearchResult | undefined {
  const slot = asSlot(payload);
  return slot ? (slot as SearchResult) : undefined;
}

function missingFields(payload?: Record<string, unknown>): string[] {
  return Array.isArray(payload?.missingFields) ? payload.missingFields.map(String) : [];
}

function serviceFrom(event: RecoveryEvent): string {
  const slot = asSlot(event.payload);
  return (
    asString(event.payload?.serviceName) ??
    asString(event.payload?.service) ??
    slot?.serviceName ??
    ""
  );
}

function cityFrom(event: RecoveryEvent): string {
  const slot = asSlot(event.payload);
  return asString(event.payload?.city) ?? slot?.city ?? "";
}

function dateFrom(event: RecoveryEvent): string {
  const slot = asSlot(event.payload);
  return asString(event.payload?.date) ?? slot?.date ?? slot?.startTime?.split("T")[0] ?? "";
}

function timeFrom(event: RecoveryEvent): string {
  const slot = asSlot(event.payload);
  return asString(event.payload?.time) ?? slot?.time ?? slot?.timeLabel ?? "";
}

function shouldEmitAgentEvent(event: RecoveryEvent): boolean {
  return Boolean(event.notifyAgent) && event.payload?.systemActionAlreadyEmitted !== true;
}

function emitCommand(event: RecoveryEvent, command: UICommand): void {
  logRecovery("[RECOVERY_UI]", event, { command: command.type, reason: command.reason });
  executeUICommand(command);
}

function emitAgentSystemAction(
  event: RecoveryEvent,
  action: SystemActionName,
  payload: Record<string, unknown>,
): void {
  if (!shouldEmitAgentEvent(event)) return;
  const systemAction: SystemActionEvent = {
    type: "system_action",
    action,
    source: "AgentBridge",
    payload,
    notifyAgent: true,
    visibleInThread: false,
    timestamp: Date.now(),
  };
  logRecovery("[RECOVERY_AGENT]", event, {
    action,
    handoffIntent: asString(payload.intent),
  });
  chatEvents.emit(systemAction);
}

function salonListBlock(event: RecoveryEvent): BaseBlock {
  const payload = event.payload ?? {};
  const salons = Array.isArray(payload.salons) ? payload.salons : [];
  const service = serviceFrom(event);
  const city = cityFrom(event);
  return {
    id: `recovery-missing-salon-${Date.now()}`,
    type: "SalonListBlock",
    priority: 1,
    metadata: {
      serviceId: asString(payload.serviceId) ?? "",
      serviceName: service,
      variantName: "",
      service,
      city,
      salons,
    },
  };
}

function appointmentCalendarBlock(event: RecoveryEvent): BaseBlock {
  const slot = selectedSlotPayload(event.payload);
  const slots = Array.isArray(event.payload?.slots)
    ? (event.payload?.slots as SearchResult[])
    : slot
      ? [slot]
      : [];
  return {
    id: `recovery-calendar-${Date.now()}`,
    type: "AppointmentCalendarBlock",
    priority: 1,
    metadata: {
      serviceId: asString(event.payload?.serviceId) ?? slot?.serviceId ?? "",
      serviceName: serviceFrom(event),
      variantName: "",
      slots,
      city: cityFrom(event),
      service: serviceFrom(event),
    },
  };
}

function authBlock(event: RecoveryEvent): BaseBlock {
  return {
    id: `recovery-auth-${Date.now()}`,
    type: "AuthBlock",
    priority: 1,
    metadata: {
      serviceId: "",
      serviceName: "",
      variantName: "",
      mode: "login",
      selectedSlot: asSlot(event.payload) as SearchResult | undefined,
    },
  };
}

function servicePriceBlock(event: RecoveryEvent): BaseBlock {
  return {
    id: `recovery-service-${Date.now()}`,
    type: "ServicePriceBlock",
    priority: 1,
    metadata: {
      serviceId: asString(event.payload?.serviceId) ?? "",
      serviceName: serviceFrom(event),
      variantName: "",
      city: cityFrom(event),
      salonId: asString(event.payload?.salonId) ?? asSlot(event.payload)?.salonId ?? "",
      salonName: asString(event.payload?.salonName) ?? asSlot(event.payload)?.salonName ?? "",
    },
  };
}

function notifyMeBlock(event: RecoveryEvent): BaseBlock {
  return {
    id: `recovery-notify-${Date.now()}`,
    type: "NotifyMeBlock",
    priority: 1,
    metadata: {
      serviceId: asString(event.payload?.serviceId) ?? asSlot(event.payload)?.serviceId ?? "",
      serviceName: serviceFrom(event),
      variantName: "",
      city: cityFrom(event),
      service: serviceFrom(event),
      selectedSlot: asSlot(event.payload) as SearchResult | undefined,
    },
  };
}

function emitClarification(event: RecoveryEvent, intent: string): void {
  emitCommand(event, { type: "OPEN_DRAWER", reason: `${event.reason}_clarification` });
  emitAgentSystemAction(event, "BOOKING_PAYLOAD_INCOMPLETE", {
    intent,
    selectedSlot: asSlot(event.payload),
    missingFields: missingFields(event.payload),
    service: serviceFrom(event),
    city: cityFrom(event),
    date: dateFrom(event),
    time: timeFrom(event),
  });
}

function handleSlotTaken(event: RecoveryEvent): void {
  emitCommand(event, { type: "OPEN_DRAWER", reason: "slot_taken_recovery" });
  emitCommand(event, {
    type: "SHOW_TOAST",
    message: "Taj termin je u međuvremenu zauzet. Proveravam najbliži slobodan termin.",
    variant: "error",
    reason: "slot_taken_recovery",
  });
  emitAgentSystemAction(event, "BOOKING_CONFLICT", {
    intent: "booking_conflict",
    ...event.payload,
  });
}

function handleMissingSalon(event: RecoveryEvent): void {
  const city = cityFrom(event);
  const service = serviceFrom(event);
  emitCommand(event, {
    type: "SHOW_TOAST",
    message: "Nedostaje salon. Pokušavam da pronađem odgovarajući salon.",
    variant: "info",
    reason: "missing_salon",
  });
  if (city && service) {
    emitCommand(event, {
      type: "RENDER_BLOCK",
      surface: "workspace",
      block: salonListBlock(event),
      reason: "missing_salon",
    });
    emitAgentSystemAction(event, "BOOKING_PAYLOAD_INCOMPLETE", {
      intent: "recover_missing_salon",
      selectedSlot: asSlot(event.payload),
      missingFields: missingFields(event.payload),
      service,
      city,
      date: dateFrom(event),
      time: timeFrom(event),
      salons: Array.isArray(event.payload?.salons) ? event.payload?.salons : undefined,
    });
    return;
  }
  emitClarification(event, "recover_missing_salon");
}

function handleMissingStartTime(event: RecoveryEvent): void {
  const slot = asSlot(event.payload);
  const date = dateFrom(event);
  const time = timeFrom(event);
  if (slot && date && time) {
    const recoveredSlot: BookingModalSlot = {
      ...slot,
      date,
      time,
      timeLabel: time,
      startTime: slot.startTime || buildBelgradeStartTime(date, time),
    };
    const normalized = normalizeBookingPayload(recoveredSlot);
    bookingFlow.get().collect({
      date: normalized?.date,
      time: normalized?.time,
    });
    if (validateBookingPayload(normalized).ok && normalized) {
      emitCommand(event, {
        type: "OPEN_BOOKING_MODAL",
        payload: normalized.originalSlot,
        reason: "missing_start_time_recovered",
      });
      return;
    }
  }

  emitCommand(event, {
    type: "SHOW_TOAST",
    message: "Nedostaje termin. Izaberite vreme ponovo.",
    variant: "error",
    reason: "missing_start_time",
  });
  if (slot) {
    emitCommand(event, {
      type: "RENDER_BLOCK",
      surface: "workspace",
      block: appointmentCalendarBlock(event),
      reason: "missing_start_time",
    });
  }
}

function handleMissingService(event: RecoveryEvent): void {
  emitCommand(event, {
    type: "SHOW_TOAST",
    message: "Izaberite uslugu za termin.",
    variant: "info",
    reason: "missing_service",
  });
  if (cityFrom(event) || asSlot(event.payload)?.salonId) {
    emitCommand(event, {
      type: "RENDER_BLOCK",
      surface: "workspace",
      block: servicePriceBlock(event),
      reason: "missing_service",
    });
    return;
  }
  emitClarification(event, "missing_service");
}

function handleMissingContact(event: RecoveryEvent): void {
  emitCommand(event, {
    type: "SHOW_TOAST",
    message: "Unesite telefon, email ili Instagram za potvrdu termina.",
    variant: "error",
    reason: "missing_contact",
  });
  // A toast alone is a dead end — the booking modal carries the contact form,
  // so reopen it for the selected slot. When the event already came from the
  // modal the form is on screen (reopening would wipe typed fields) — skip.
  if (event.source !== "BookingModal") {
    const slot = asSlot(event.payload);
    const normalized = slot ? normalizeBookingPayload(slot) : null;
    if (normalized && validateBookingPayload(normalized).ok) {
      emitCommand(event, {
        type: "OPEN_BOOKING_MODAL",
        payload: normalized.originalSlot,
        reason: "missing_contact",
      });
      return;
    }
    emitClarification(event, "missing_contact");
  }
}

function handleAuthRequired(event: RecoveryEvent): void {
  const slot = asSlot(event.payload);
  if (slot) {
    bookingFlow.get().collect({
      category: slot.category ?? undefined,
      service: slot.serviceName ?? undefined,
      serviceId: slot.serviceId ?? undefined,
      serviceName: slot.serviceName,
      city: slot.city,
      salonId: slot.salonId ?? undefined,
      salonName: slot.salonName,
      date: slot.date ?? slot.startTime?.split("T")[0],
      time: slot.time ?? slot.timeLabel,
    });
  }
  emitCommand(event, {
    type: "RENDER_BLOCK",
    surface: "workspace",
    block: authBlock(event),
    reason: "auth_required",
  });
}

function handleBookingSubmitFailed(event: RecoveryEvent): void {
  emitCommand(event, {
    type: "SHOW_TOAST",
    message: "Zakazivanje trenutno nije uspelo. Pokušajte ponovo.",
    variant: "error",
    reason: "booking_submit_failed",
  });
  if (event.payload?.aiFlowActive === true) {
    emitCommand(event, { type: "OPEN_DRAWER", reason: "booking_submit_failed" });
  }
}

function handleCancelExpired(event: RecoveryEvent): void {
  emitCommand(event, {
    type: "SHOW_TOAST",
    message: "Vreme za otkazivanje termina je isteklo.",
    variant: "error",
    reason: "cancel_expired",
  });
}

function handleNoSlots(event: RecoveryEvent): void {
  emitCommand(event, {
    type: "RENDER_BLOCK",
    surface: "workspace",
    block: notifyMeBlock(event),
    reason: "no_slots",
  });
  emitAgentSystemAction(event, "BOOKING_PAYLOAD_INCOMPLETE", {
    intent: "no_slots",
    selectedSlot: asSlot(event.payload),
    service: serviceFrom(event),
    city: cityFrom(event),
    date: dateFrom(event),
    time: timeFrom(event),
  });
}

function handleNotifyCreated(event: RecoveryEvent): void {
  emitCommand(event, {
    type: "SHOW_TOAST",
    message: "Obavestićemo vas čim se pojavi slobodan termin.",
    variant: "success",
    reason: "notify_created",
  });
}

function handleUnknown(event: RecoveryEvent): void {
  emitCommand(event, {
    type: "SHOW_TOAST",
    message: "Došlo je do greške. Pokušajte ponovo.",
    variant: "error",
    reason: "unknown_recovery",
  });
  // A toast alone is a dead end — open the assistant with the context we
  // have so the conversation continues instead of stopping at an error.
  emitClarification(event, "booking");
}

const handlers: Record<RecoveryReason, (event: RecoveryEvent) => void> = {
  slot_taken: handleSlotTaken,
  missing_salon: handleMissingSalon,
  missing_start_time: handleMissingStartTime,
  missing_service: handleMissingService,
  missing_contact: handleMissingContact,
  auth_required: handleAuthRequired,
  booking_submit_failed: handleBookingSubmitFailed,
  cancel_expired: handleCancelExpired,
  no_slots: handleNoSlots,
  notify_created: handleNotifyCreated,
  unknown: handleUnknown,
};

export function handleRecoveryEvent(event: RecoveryEvent): void {
  const safeEvent: RecoveryEvent = {
    ...event,
    type: "recovery",
    visibleInThread: false,
    timestamp: event.timestamp ?? Date.now(),
  };
  logRecovery("[RECOVERY_ENGINE]", safeEvent);
  chatEvents.emit(safeEvent);
  handlers[safeEvent.reason](safeEvent);
}

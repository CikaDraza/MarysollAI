import type { ChatEvent, SystemActionEvent } from "@/lib/ai/events/chat-event-types";
import type { BookingWorkflowContext } from "@/lib/ai/workflow/booking-workflow-types";
import type {
  EpisodicMemory,
  LastFailedBookingEpisode,
  SessionSummary,
} from "./agent-memory-types";

export interface BuildEpisodicMemoryInput {
  recentEvents?: ChatEvent[];
  bookingWorkflowContext?: BookingWorkflowContext;
  bookingFlowCollected?: Record<string, unknown>;
  currentUserId?: string;
}

const EPISODIC_ACTIONS = new Set<SystemActionEvent["action"]>([
  "BOOKING_SUBMIT_SUCCESS",
  "BOOKING_CONFLICT",
  "NOTIFY_ME_CREATED",
  "BOOKING_SUBMIT_FAILED",
  "APPOINTMENT_CANCELLED",
  "APPOINTMENT_UPDATED",
]);

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asHour(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const stringValue = asString(value);
    if (stringValue) return stringValue;
  }
  return undefined;
}

function eventPayload(event: SystemActionEvent): Record<string, unknown> {
  return event.payload ?? {};
}

function readStructuredField(
  event: SystemActionEvent,
  context: BookingWorkflowContext | undefined,
  collected: Record<string, unknown> | undefined,
  key: string,
): unknown {
  const payload = eventPayload(event);
  const selectedSlot = context?.selectedSlot as Record<string, unknown> | undefined;
  const bookingPayload = context?.bookingPayload;
  const pendingBooking = context?.pendingBooking;
  const intent = context?.intent;

  return (
    payload[key] ??
    selectedSlot?.[key] ??
    bookingPayload?.[key] ??
    pendingBooking?.[key] ??
    collected?.[key] ??
    intent?.[key]
  );
}

function buildSummary(
  event: SystemActionEvent,
  input: BuildEpisodicMemoryInput,
): SessionSummary | null {
  if (!EPISODIC_ACTIONS.has(event.action)) return null;

  const read = (key: string) =>
    readStructuredField(
      event,
      input.bookingWorkflowContext,
      input.bookingFlowCollected,
      key,
    );
  const id = event.actionId ?? `${event.action}:${event.timestamp}`;
  const base = {
    id,
    timestamp: new Date(event.timestamp).toISOString(),
    city: firstString(read("city"), read("requestedCity")),
    service: firstString(read("service"), read("serviceName")),
    category: asString(read("category")),
    salonId: asString(read("salonId")),
    salonName: firstString(read("salonName"), read("salon")),
    timeWindowStart: asHour(read("timeWindowStart")),
    timeWindowEnd: asHour(read("timeWindowEnd")),
    selectedTime: firstString(read("selectedTime"), read("time"), read("requestedTime")),
  };

  if (event.action === "BOOKING_SUBMIT_SUCCESS") {
    return { ...base, type: "booking", outcome: "success" };
  }
  if (event.action === "BOOKING_CONFLICT") {
    return {
      ...base,
      type: "booking",
      outcome: "slot_taken",
      recoveryUsed: true,
      recoveryReason: "slot_taken",
    };
  }
  if (event.action === "NOTIFY_ME_CREATED") {
    return { ...base, type: "notify_me", outcome: "notify_created" };
  }
  if (event.action === "BOOKING_SUBMIT_FAILED") {
    return {
      ...base,
      type: "booking",
      outcome: "failed",
      recoveryReason: firstString(read("error"), read("reason")),
    };
  }
  if (event.action === "APPOINTMENT_CANCELLED") {
    return { ...base, type: "cancel", outcome: "cancelled" };
  }
  if (event.action === "APPOINTMENT_UPDATED") {
    return { ...base, type: "reschedule", outcome: "rescheduled" };
  }

  return null;
}

function lastFailedFrom(summary: SessionSummary): LastFailedBookingEpisode | undefined {
  if (!["slot_taken", "no_slots", "failed"].includes(summary.outcome)) return undefined;

  return {
    timestamp: summary.timestamp,
    city: summary.city,
    service: summary.service,
    salonName: summary.salonName,
    requestedTime: summary.selectedTime,
    reason:
      summary.outcome === "slot_taken"
        ? "slot_taken"
        : summary.outcome === "no_slots"
          ? "no_slots"
          : "submit_failed",
    recoveryUsed: summary.recoveryUsed,
  };
}

function topRecent(values: (string | undefined)[], limit: number): string[] {
  const counts = new Map<string, number>();
  const latest = new Map<string, number>();
  values.forEach((value, index) => {
    if (!value) return;
    counts.set(value, (counts.get(value) ?? 0) + 1);
    latest.set(value, index);
  });

  return [...counts.keys()]
    .sort((a, b) => {
      const countDiff = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
      if (countDiff !== 0) return countDiff;
      return (latest.get(b) ?? 0) - (latest.get(a) ?? 0);
    })
    .slice(0, limit);
}

export function buildEpisodicMemory(
  input: BuildEpisodicMemoryInput = {},
): EpisodicMemory {
  const summaries = (input.recentEvents ?? [])
    .filter((event): event is SystemActionEvent => event.type === "system_action")
    .map((event) => buildSummary(event, input))
    .filter((summary): summary is SessionSummary => Boolean(summary));

  const sessionSummaries = summaries.slice(-5);
  const lastSuccessfulBooking = [...sessionSummaries]
    .reverse()
    .find((summary) => summary.type === "booking" && summary.outcome === "success");
  const lastFailedBooking = [...sessionSummaries]
    .reverse()
    .map(lastFailedFrom)
    .find((episode): episode is LastFailedBookingEpisode => Boolean(episode));
  const preferenceSource = sessionSummaries.filter((summary) =>
    ["success", "notify_created"].includes(summary.outcome),
  );

  return {
    sessionSummaries,
    lastSuccessfulBooking,
    lastFailedBooking,
    preferredCities: topRecent(preferenceSource.map((summary) => summary.city), 3),
    preferredServices: topRecent(preferenceSource.map((summary) => summary.service), 3),
    preferredSalons: topRecent(preferenceSource.map((summary) => summary.salonName), 3),
  };
}

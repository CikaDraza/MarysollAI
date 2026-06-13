import type { SystemActionEvent } from "@/lib/ai/events/chat-event-types";
import type { EpisodicMemory, SessionSummary } from "./agent-memory-types";
import { buildEpisodicMemory } from "./buildEpisodicMemory";
import { postClientEpisode } from "./client-episode-writer";

const EMPTY_EPISODIC_MEMORY: EpisodicMemory = {
  sessionSummaries: [],
  preferredCities: [],
  preferredServices: [],
  preferredSalons: [],
};

let recentEvents: SystemActionEvent[] = [];

function isWritableEpisodeAction(action: SystemActionEvent["action"]): boolean {
  return (
    action === "BOOKING_SUBMIT_SUCCESS" ||
    action === "BOOKING_CONFLICT" ||
    action === "NOTIFY_ME_CREATED" ||
    action === "BOOKING_SUBMIT_FAILED" ||
    action === "APPOINTMENT_CANCELLED" ||
    action === "APPOINTMENT_UPDATED"
  );
}

export function recordEpisodicSystemAction(event: SystemActionEvent): void {
  if (!isWritableEpisodeAction(event.action)) return;
  recentEvents = [...recentEvents, event].slice(-20);
  // Faza 6 — persist client-resolved episodes to Mongo (no-op for the
  // server-resolved subset, which askAgent writes in-process).
  postClientEpisode(event);
}

export function getEpisodicMemorySnapshot(): EpisodicMemory {
  if (recentEvents.length === 0) return { ...EMPTY_EPISODIC_MEMORY };
  return buildEpisodicMemory({ recentEvents });
}

export function resetEpisodicSessionStore(): void {
  recentEvents = [];
}

export function seedEpisodicSessionSummaries(
  sessionSummaries: SessionSummary[],
): void {
  recentEvents = sessionSummaries.map((summary) => ({
    type: "system_action",
    action:
      summary.outcome === "success"
        ? "BOOKING_SUBMIT_SUCCESS"
        : summary.outcome === "slot_taken"
          ? "BOOKING_CONFLICT"
          : summary.outcome === "notify_created"
            ? "NOTIFY_ME_CREATED"
            : summary.outcome === "cancelled"
              ? "APPOINTMENT_CANCELLED"
              : summary.outcome === "rescheduled"
                ? "APPOINTMENT_UPDATED"
                : "BOOKING_SUBMIT_FAILED",
    actionId: summary.id,
    payload: {
      city: summary.city,
      service: summary.service,
      category: summary.category,
      salonId: summary.salonId,
      salonName: summary.salonName,
      timeWindowStart: summary.timeWindowStart,
      timeWindowEnd: summary.timeWindowEnd,
      selectedTime: summary.selectedTime,
    },
    source: "Unknown",
    visibleInThread: false,
    timestamp: new Date(summary.timestamp).getTime(),
  }));
}

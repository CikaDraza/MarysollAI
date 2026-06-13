// src/lib/ai/memory/client-episode-writer.ts
//
// Faza 6 — klijentski upis epizoda za događaje koji se razrešavaju na klijentu
// (stvarni platform write je već prošao). Fire-and-forget POST ka
// /api/ai/episodes; nikad ne baca i nikad ne blokira UI.

import type { SystemActionEvent } from "@/lib/ai/events/chat-event-types";
import type {
  AgentEpisodeOutcome,
  AgentEpisodeType,
} from "@/lib/models/AgentEpisode";
import { getEpisodeIdentity } from "./conversation-session";

// Server-resolved događaji (BOOKING_CONFLICT, PRICE_VIEWED, NO_SLOTS) se NE
// upisuju ovde — njih piše askAgent u procesu, sa punim kontekstom.
const CLIENT_EPISODE_MAP: Partial<
  Record<
    SystemActionEvent["action"],
    { type: AgentEpisodeType; outcome: AgentEpisodeOutcome }
  >
> = {
  BOOKING_SUBMIT_SUCCESS: { type: "booking", outcome: "success" },
  NOTIFY_ME_CREATED: { type: "notify", outcome: "notify_created" },
  APPOINTMENT_CANCELLED: { type: "appointment_cancel", outcome: "cancelled" },
  APPOINTMENT_UPDATED: { type: "appointment_update", outcome: "updated" },
};

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function postClientEpisode(event: SystemActionEvent): void {
  const mapping = CLIENT_EPISODE_MAP[event.action];
  if (!mapping) return;
  if (typeof window === "undefined") return;

  const payload = event.payload ?? {};
  const slot =
    payload.selectedSlot && typeof payload.selectedSlot === "object"
      ? (payload.selectedSlot as Record<string, unknown>)
      : {};
  const pick = (key: string): unknown => payload[key] ?? slot[key];

  const { conversationId, guestSessionId } = getEpisodeIdentity();
  const token =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("assistant_token")
      : null;

  const body = {
    conversationId,
    guestSessionId,
    type: mapping.type,
    outcome: mapping.outcome,
    city: str(pick("city")) ?? str(pick("requestedCity")),
    service: str(pick("service")) ?? str(pick("serviceName")),
    category: str(pick("category")),
    salonId: str(pick("salonId")),
    salonName: str(pick("salonName")) ?? str(pick("salon")),
    date: str(pick("date")),
    time: str(pick("time")) ?? str(pick("selectedTime")) ?? str(pick("timeLabel")),
  };

  void fetch("/api/ai/episodes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {
    // best-effort: epizoda je obogaćivanje, ne kritičan put
  });
}

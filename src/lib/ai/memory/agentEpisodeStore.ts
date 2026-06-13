// src/lib/ai/memory/agentEpisodeStore.ts
//
// Faza 6 — serverski upis/čitanje strukturisanih epizoda (Mongo).
// Jedini izvor istine za "prošli put". Bez PII, bez raw poruka.

import "server-only";
import { connectToDB } from "@/lib/db/mongodb";
import {
  AgentEpisode,
  type AgentEpisodeOutcome,
  type AgentEpisodeType,
  type IAgentEpisode,
} from "@/lib/models/AgentEpisode";
import type {
  EpisodicMemory,
  LastFailedBookingEpisode,
  SessionSummary,
} from "./agent-memory-types";

export interface RecordAgentEpisodeInput {
  conversationId: string;
  userId?: string;
  guestSessionId?: string;
  type: AgentEpisodeType;
  outcome: AgentEpisodeOutcome;
  city?: string;
  service?: string;
  category?: string;
  salonId?: string;
  salonName?: string;
  date?: string;
  time?: string;
  recoveryUsed?: boolean;
}

export interface EpisodeRecallKey {
  userId?: string;
  guestSessionId?: string;
  conversationId?: string;
}

const DEDUPE_WINDOW_MS = 10_000;

function clean<T extends object>(obj: T): T {
  const next = { ...obj } as Record<string, unknown>;
  for (const key of Object.keys(next)) {
    const value = next[key];
    if (value === undefined || value === null || value === "") delete next[key];
  }
  return next as T;
}

/**
 * Persists one structured episode. Requires a recall key (userId or
 * guestSessionId) — without it the episode can never be read back, so we skip
 * the write rather than orphan a row. Light dedup avoids double rows from
 * re-renders / replayed system actions.
 */
export async function recordAgentEpisode(
  input: RecordAgentEpisodeInput,
): Promise<void> {
  if (!input.conversationId) return;
  if (!input.userId && !input.guestSessionId) return;

  try {
    await connectToDB();

    const dedupeMatch = clean({
      conversationId: input.conversationId,
      type: input.type,
      outcome: input.outcome,
      city: input.city,
      service: input.service,
      salonId: input.salonId,
    });
    const recent = await AgentEpisode.findOne({
      ...dedupeMatch,
      createdAt: { $gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
    })
      .select("_id")
      .lean();
    if (recent) return;

    await AgentEpisode.create(
      clean<IAgentEpisode>({
        conversationId: input.conversationId,
        userId: input.userId,
        guestSessionId: input.guestSessionId,
        type: input.type,
        outcome: input.outcome,
        city: input.city,
        service: input.service,
        category: input.category,
        salonId: input.salonId,
        salonName: input.salonName,
        date: input.date,
        time: input.time,
        recoveryUsed: input.recoveryUsed,
      }),
    );
  } catch (error) {
    // Episodes are best-effort enrichment — a write failure must never break
    // the booking flow.
    console.error("[recordAgentEpisode] failed:", error);
  }
}

/** Reads recent episodes for the strongest available identity (userId for
 * logged-in, else guestSessionId). conversationId alone is a last resort. */
export async function fetchRecentEpisodes(
  key: EpisodeRecallKey,
  limit = 10,
): Promise<IAgentEpisode[]> {
  const filter = key.userId
    ? { userId: key.userId }
    : key.guestSessionId
      ? { guestSessionId: key.guestSessionId }
      : key.conversationId
        ? { conversationId: key.conversationId }
        : null;
  if (!filter) return [];

  try {
    await connectToDB();
    const rows = await AgentEpisode.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return rows as unknown as IAgentEpisode[];
  } catch (error) {
    console.error("[fetchRecentEpisodes] failed:", error);
    return [];
  }
}

const TYPE_TO_SUMMARY: Record<AgentEpisodeType, SessionSummary["type"]> = {
  booking: "booking",
  price: "search",
  search: "search",
  notify: "notify_me",
  appointment_update: "reschedule",
  appointment_cancel: "cancel",
};

const OUTCOME_TO_SUMMARY: Record<AgentEpisodeOutcome, SessionSummary["outcome"]> =
  {
    success: "success",
    failed: "failed",
    slot_taken: "slot_taken",
    no_slots: "no_slots",
    notify_created: "notify_created",
    cancelled: "cancelled",
    updated: "rescheduled",
    viewed: "success",
  };

function topRecent(values: Array<string | undefined>, limit: number): string[] {
  const counts = new Map<string, number>();
  const latest = new Map<string, number>();
  values.forEach((value, index) => {
    if (!value) return;
    counts.set(value, (counts.get(value) ?? 0) + 1);
    latest.set(value, index);
  });
  return [...counts.keys()]
    .sort((a, b) => {
      const diff = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
      if (diff !== 0) return diff;
      return (latest.get(b) ?? 0) - (latest.get(a) ?? 0);
    })
    .slice(0, limit);
}

/** Maps DB episodes (newest-first) into the EpisodicMemory shape the prompt
 * formatter already understands. */
export function episodesToEpisodicMemory(
  episodes: IAgentEpisode[],
): EpisodicMemory {
  // Oldest → newest for stable "most recent wins" semantics below.
  const ordered = [...episodes].reverse();
  const sessionSummaries: SessionSummary[] = ordered.map((episode, index) => ({
    id: `${episode.conversationId}:${index}`,
    timestamp: (episode.createdAt ?? new Date()).toISOString(),
    type: TYPE_TO_SUMMARY[episode.type],
    city: episode.city,
    service: episode.service,
    category: episode.category,
    salonId: episode.salonId,
    salonName: episode.salonName,
    selectedTime: episode.time,
    outcome: OUTCOME_TO_SUMMARY[episode.outcome],
    recoveryUsed: episode.recoveryUsed,
  }));

  const lastSuccessfulBooking = [...sessionSummaries]
    .reverse()
    .find((s) => s.type === "booking" && s.outcome === "success");

  const lastFailed = [...sessionSummaries]
    .reverse()
    .find((s) => ["slot_taken", "no_slots", "failed"].includes(s.outcome));
  const lastFailedBooking: LastFailedBookingEpisode | undefined = lastFailed
    ? {
        timestamp: lastFailed.timestamp,
        city: lastFailed.city,
        service: lastFailed.service,
        salonName: lastFailed.salonName,
        requestedTime: lastFailed.selectedTime,
        reason:
          lastFailed.outcome === "slot_taken"
            ? "slot_taken"
            : lastFailed.outcome === "no_slots"
              ? "no_slots"
              : "submit_failed",
        recoveryUsed: lastFailed.recoveryUsed,
      }
    : undefined;

  // Preferences from positive signals: successful bookings, price/search
  // interest, notify subscriptions — they show what the user keeps coming for.
  const interest = sessionSummaries.filter((s) =>
    ["success", "notify_created", "viewed"].includes(s.outcome),
  );
  // Newest-first so "preferred" reflects most recent intent.
  const interestNewestFirst = [...interest].reverse();

  return {
    sessionSummaries: sessionSummaries.slice(-5),
    lastSuccessfulBooking,
    lastFailedBooking,
    preferredCities: topRecent(
      interestNewestFirst.map((s) => s.city),
      3,
    ),
    preferredServices: topRecent(
      interestNewestFirst.map((s) => s.service),
      3,
    ),
    preferredSalons: topRecent(
      interestNewestFirst.map((s) => s.salonName),
      3,
    ),
  };
}

/** Convenience: recall key → ready EpisodicMemory for prompt injection. */
export async function fetchEpisodicMemory(
  key: EpisodeRecallKey,
): Promise<EpisodicMemory | undefined> {
  const episodes = await fetchRecentEpisodes(key);
  if (episodes.length === 0) return undefined;
  return episodesToEpisodicMemory(episodes);
}

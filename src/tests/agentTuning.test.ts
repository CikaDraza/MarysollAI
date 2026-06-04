// src/tests/agentTuning.test.ts
//
// Covers the conversation-quality tuning:
//   C — robust intent: natural follow-ups keep context instead of "unknown".
//   A — unified memory: resolved entities are extracted for write-back.
//   B — rolling summary of older turns.
//   F1 — makeup/eyebrows semantic separation.
import { parseClaudiaDirectIntent } from "@/services/askAgent";
import { extractBookingMemory } from "@/lib/ai/parseClaudiaResponse";
import { buildConversationSummary } from "@/lib/ai/buildConversationSummary";
import { findSemanticCategory, SERVICE_SEMANTIC_MAP } from "@/lib/search/serviceSemanticMap";
import type { CollectedBookingFields } from "@/lib/ai/booking-flow-state";
import type { ThreadItem } from "@/types/ai/chat-thread";

const ctx: CollectedBookingFields = { service: "šminkanje", city: "Kruševac" };

function msg(role: "user" | "assistant", content: string, i: number): ThreadItem {
  return {
    id: `m${i}`,
    type: "message",
    data: { id: `m${i}`, role, content, timestamp: 1_000 + i },
  };
}

describe("C — robust follow-up intent", () => {
  it("'posle 11 časova' with context is a time-window follow-up, not unknown", () => {
    const intent = parseClaudiaDirectIntent({
      text: "Da li može neki termin posle 11 časova?",
      collectedBookingFields: ctx,
    });
    expect(intent.type).not.toBe("unknown");
    expect(["follow_up", "booking"]).toContain(intent.type);
    expect(intent.entities.timeWindowStart).toBe(11);
  });

  it("'može popodne?' with context maps to an afternoon window", () => {
    const intent = parseClaudiaDirectIntent({
      text: "može popodne?",
      collectedBookingFields: ctx,
    });
    expect(intent.type).not.toBe("unknown");
    expect(intent.entities.timeWindowStart).toBe(12);
    expect(intent.entities.timeWindowEnd).toBe(17);
  });

  it("'a ima li nešto kasnije' with context is a refinement, not unknown", () => {
    const intent = parseClaudiaDirectIntent({
      text: "a ima li nešto kasnije",
      collectedBookingFields: ctx,
    });
    expect(intent.type).toBe("follow_up");
  });

  it("'pre 14' with context sets an upper bound", () => {
    const intent = parseClaudiaDirectIntent({
      text: "može pre 14",
      collectedBookingFields: ctx,
    });
    expect(intent.type).not.toBe("unknown");
    expect(intent.entities.timeWindowEnd).toBe(14);
  });

  it("a bare refinement WITHOUT context does not hijack into booking", () => {
    const intent = parseClaudiaDirectIntent({ text: "posle 11", collectedBookingFields: {} });
    expect(intent.type).toBe("unknown");
  });
});

describe("A — booking memory extraction for write-back", () => {
  it("pulls entities from intent and block metadata", () => {
    const raw = JSON.stringify({
      messages: [{ role: "assistant", content: "Evo termina." }],
      layout: [
        {
          type: "AppointmentCalendarBlock",
          metadata: { service: "šminkanje", city: "Kruševac", date: "2026-06-10" },
        },
      ],
      intent: { type: "booking", city: "Kruševac", service: "šminkanje", timeWindowStart: 11 },
    });
    const mem = extractBookingMemory(raw);
    expect(mem.service).toBe("šminkanje");
    expect(mem.city).toBe("Kruševac");
    expect(mem.date).toBe("2026-06-10");
    expect(mem.timeWindowStart).toBe(11);
  });

  it("returns empty object for garbage / empty input (never throws)", () => {
    expect(extractBookingMemory("")).toEqual({});
    expect(extractBookingMemory("not json")).toEqual({});
  });

  it("drops undefined fields so it never clobbers existing memory", () => {
    const mem = extractBookingMemory(
      JSON.stringify({ messages: [{ role: "assistant", content: "x" }], intent: { city: "Niš" } }),
    );
    expect(mem).toEqual({ city: "Niš" });
    expect("service" in mem).toBe(false);
  });
});

describe("B — rolling conversation summary", () => {
  it("summarizes turns that fall outside the recent window", () => {
    const history: ThreadItem[] = [
      msg("user", "Hoću šminkanje", 0),
      msg("assistant", "U kom gradu?", 1),
      msg("user", "Kruševac", 2),
      msg("assistant", "Evo termina.", 3),
      msg("user", "posle 11?", 4),
    ];
    const summary = buildConversationSummary(history, 2);
    expect(summary).toContain("RANIJI TOK RAZGOVORA");
    expect(summary).toContain("Hoću šminkanje");
    expect(summary).toContain("Kruševac");
  });

  it("returns empty string when nothing is older than the window", () => {
    const history: ThreadItem[] = [msg("user", "Zdravo", 0), msg("assistant", "Ćao", 1)];
    expect(buildConversationSummary(history, 10)).toBe("");
  });
});

describe("F1 — makeup/eyebrows semantic separation", () => {
  it("'obrve' resolves to eyebrows, not makeup", () => {
    expect(findSemanticCategory("obrve")).toBe("eyebrows");
  });

  it("'šminkanje' still resolves to makeup", () => {
    expect(findSemanticCategory("šminkanje")).toBe("makeup");
  });

  it("makeup bucket no longer contains brow/lash terms", () => {
    expect(SERVICE_SEMANTIC_MAP.makeup.terms).not.toContain("obrve");
    expect(SERVICE_SEMANTIC_MAP.makeup.terms).not.toContain("trepavice");
  });
});

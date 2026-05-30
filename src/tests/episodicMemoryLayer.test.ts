import { buildMariaSystemPrompt } from "@/app/api/ai/deepseek-conversation/route";
import type { ChatEvent, SystemActionEvent } from "@/lib/ai/events/chat-event-types";
import { buildEpisodicMemory } from "@/lib/ai/memory/buildEpisodicMemory";
import { buildAgentMemoryContext } from "@/lib/ai/memory/buildAgentMemoryContext";
import { formatAgentMemoryForPrompt } from "@/lib/ai/memory/formatAgentMemoryForPrompt";
import {
  getEpisodicMemorySnapshot,
  recordEpisodicSystemAction,
  resetEpisodicSessionStore,
} from "@/lib/ai/memory/episodic-session-store";
import { routeUserMessageToAgent } from "@/lib/ai/routing/agentEntryRouter";
import { buildClaudiaSystemPrompt } from "@/services/askAgent";

function systemAction(
  action: SystemActionEvent["action"],
  payload: Record<string, unknown> = {},
  timestamp = Date.UTC(2026, 4, 28, 12, 0, 0),
): SystemActionEvent {
  return {
    type: "system_action",
    action,
    actionId: `${action}-${timestamp}`,
    payload,
    source: "BookingModal",
    visibleInThread: false,
    timestamp,
  };
}

describe("lightweight episodic memory", () => {
  beforeEach(() => {
    resetEpisodicSessionStore();
  });

  it("buildEpisodicMemory creates success summary from BOOKING_SUBMIT_SUCCESS", () => {
    const memory = buildEpisodicMemory({
      recentEvents: [
        systemAction("BOOKING_SUBMIT_SUCCESS", {
          city: "Bor",
          service: "Maderoterapija",
          salonName: "Beauty M Glow",
          selectedTime: "15:00",
        }),
      ],
    });

    expect(memory.sessionSummaries[0]).toMatchObject({
      type: "booking",
      city: "Bor",
      service: "Maderoterapija",
      salonName: "Beauty M Glow",
      selectedTime: "15:00",
      outcome: "success",
    });
    expect(memory.lastSuccessfulBooking?.salonName).toBe("Beauty M Glow");
  });

  it("BOOKING_CONFLICT creates lastFailedBooking with slot_taken", () => {
    const memory = buildEpisodicMemory({
      recentEvents: [
        systemAction("BOOKING_CONFLICT", {
          city: "Bor",
          service: "Maderoterapija",
          salonName: "Beauty M Glow",
          selectedTime: "15:00",
        }),
      ],
    });

    expect(memory.lastFailedBooking).toMatchObject({
      reason: "slot_taken",
      requestedTime: "15:00",
      recoveryUsed: true,
    });
  });

  it("NOTIFY_ME_CREATED creates notify_created outcome", () => {
    const memory = buildEpisodicMemory({
      recentEvents: [systemAction("NOTIFY_ME_CREATED", { city: "Novi Sad", service: "feniranje" })],
    });

    expect(memory.sessionSummaries[0]).toMatchObject({
      type: "notify_me",
      outcome: "notify_created",
    });
  });

  it("preferences derive from repeated city/service", () => {
    const memory = buildEpisodicMemory({
      recentEvents: [
        systemAction("BOOKING_SUBMIT_SUCCESS", { city: "Bor", service: "Maderoterapija" }, 1),
        systemAction("BOOKING_SUBMIT_SUCCESS", { city: "Novi Sad", service: "feniranje" }, 2),
        systemAction("BOOKING_SUBMIT_SUCCESS", { city: "Bor", service: "feniranje" }, 3),
      ],
    });

    expect(memory.preferredCities[0]).toBe("Bor");
    expect(memory.preferredServices[0]).toBe("feniranje");
  });

  it("memory caps sessionSummaries to 5", () => {
    const recentEvents = Array.from({ length: 7 }, (_, index) =>
      systemAction("BOOKING_SUBMIT_SUCCESS", { city: `City ${index}` }, index + 1),
    );

    const memory = buildEpisodicMemory({ recentEvents });

    expect(memory.sessionSummaries).toHaveLength(5);
    expect(memory.sessionSummaries[0].city).toBe("City 2");
  });

  it("preferences cap to 3", () => {
    const memory = buildEpisodicMemory({
      recentEvents: ["Bor", "Novi Sad", "Beograd", "Niš"].map((city, index) =>
        systemAction("BOOKING_SUBMIT_SUCCESS", { city, service: `service-${index}` }, index + 1),
      ),
    });

    expect(memory.preferredCities).toHaveLength(3);
    expect(memory.preferredServices).toHaveLength(3);
  });

  it("contact/auth fields are never included", () => {
    const memory = buildEpisodicMemory({
      recentEvents: [
        systemAction("BOOKING_SUBMIT_SUCCESS", {
          city: "Bor",
          service: "Maderoterapija",
          phone: "+38160111222",
          email: "user@example.com",
          token: "secret-token",
          password: "secret-password",
          instagram: "@private",
        }),
      ],
    });

    const serialized = JSON.stringify(memory);
    expect(serialized).not.toContain("+38160111222");
    expect(serialized).not.toContain("user@example.com");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("secret-password");
    expect(serialized).not.toContain("@private");
  });

  it("formatted prompt has compact Episodic section", () => {
    const prompt = formatAgentMemoryForPrompt(
      buildAgentMemoryContext({
        episodicMemory: {
          sessionSummaries: [],
          lastSuccessfulBooking: {
            id: "1",
            timestamp: "2026-05-28T12:00:00.000Z",
            type: "booking",
            city: "Bor",
            service: "Maderoterapija",
            salonName: "Beauty M Glow",
            outcome: "success",
          },
          lastFailedBooking: {
            timestamp: "2026-05-28T13:00:00.000Z",
            reason: "slot_taken",
            requestedTime: "15:00",
            recoveryUsed: true,
          },
          preferredCities: ["Bor", "Novi Sad"],
          preferredServices: ["feniranje", "maderoterapija"],
          preferredSalons: ["Beauty M Glow"],
        },
      }),
    );

    expect(prompt).toContain("Episodic:");
    expect(prompt).toContain("last success: Maderoterapija u Bor, Beauty M Glow");
    expect(prompt).toContain("last failed: slot_taken, at 15:00, recovery used");
    expect(prompt).toContain("preferences: cities Bor/Novi Sad; services feniranje/maderoterapija");
  });

  it("empty episodic memory is omitted from prompt", () => {
    const prompt = formatAgentMemoryForPrompt(
      buildAgentMemoryContext({
        episodicMemory: {
          sessionSummaries: [],
          preferredCities: [],
          preferredServices: [],
          preferredSalons: [],
        },
      }),
    );

    expect(prompt).not.toContain("Episodic:");
  });

  it("Maria prompt includes Episodic when available", () => {
    const memoryContext = formatAgentMemoryForPrompt(
      buildAgentMemoryContext({
        episodicMemory: {
          sessionSummaries: [],
          lastSuccessfulBooking: {
            id: "1",
            timestamp: "2026-05-28T12:00:00.000Z",
            type: "booking",
            city: "Bor",
            service: "Maderoterapija",
            outcome: "success",
          },
          preferredCities: ["Bor"],
          preferredServices: ["Maderoterapija"],
          preferredSalons: [],
        },
      }),
    );

    expect(buildMariaSystemPrompt("", "", "", "", "Gost", false, "", "sr", memoryContext)).toContain("Episodic:");
  });

  it("Claudia prompt includes Episodic when available", () => {
    const memoryContext = formatAgentMemoryForPrompt(
      buildAgentMemoryContext({
        episodicMemory: {
          sessionSummaries: [],
          preferredCities: ["Novi Sad"],
          preferredServices: ["feniranje"],
          preferredSalons: [],
        },
      }),
    );

    expect(buildClaudiaSystemPrompt("", "", "", "", false, "Gost", memoryContext)).toContain("Episodic:");
  });

  it("Episodic memory does not override default Claudia routing", () => {
    recordEpisodicSystemAction(
      systemAction("BOOKING_SUBMIT_SUCCESS", { city: "Bor", service: "Maderoterapija" }),
    );

    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "Da li imate frizerski salon u Sremskoj Mitrovici?",
    });

    expect(getEpisodicMemorySnapshot().preferredCities).toContain("Bor");
    expect(decision.targetAgent).toBe("claudia");
  });

  it('"Može" stays continuation, not booking', () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "Može",
    });

    expect(decision.targetAgent).toBe("claudia");
    expect(decision.reason).not.toBe("direct_booking");
  });

  it("last failed slot is available as context but does not auto-book", () => {
    const memory = buildEpisodicMemory({
      recentEvents: [
        systemAction("BOOKING_CONFLICT", {
          salonName: "Beauty M Glow",
          selectedTime: "15:00",
        }),
      ],
    });
    const prompt = formatAgentMemoryForPrompt(
      buildAgentMemoryContext({ episodicMemory: memory }),
    );

    expect(prompt).toContain("last failed: slot_taken, at 15:00, recovery used");
    expect(prompt).toContain("AI must never directly open modal, render blocks, or confirm booking.");
    expect(prompt).toContain("Episodic memory is read-only context; it may suggest, never decide actions.");
  });

  it("builder is pure and does not mutate input", () => {
    const recentEvents: ChatEvent[] = [
      systemAction("BOOKING_SUBMIT_SUCCESS", { city: "Bor", service: "Maderoterapija" }),
    ];
    const input = {
      recentEvents,
      bookingFlowCollected: { city: "Novi Sad" },
      currentUserId: "user-1",
    };
    const before = JSON.stringify(input);

    buildEpisodicMemory(input);

    expect(JSON.stringify(input)).toBe(before);
  });
});

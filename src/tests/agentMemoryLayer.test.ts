import { buildMariaSystemPrompt } from "@/app/api/ai/deepseek-conversation/route";
import { getProceduralMemory } from "@/lib/ai/memory/procedural-memory";
import { buildAgentMemoryContext } from "@/lib/ai/memory/buildAgentMemoryContext";
import { formatAgentMemoryForPrompt } from "@/lib/ai/memory/formatAgentMemoryForPrompt";
import { buildClaudiaSystemPrompt } from "@/services/askAgent";

describe("AI memory layer", () => {
  it("buildAgentMemoryContext includes bookingFlow collected city/service/date", () => {
    const memory = buildAgentMemoryContext({
      bookingFlowCollected: {
        city: "Novi Sad",
        service: "feniranje",
        date: "2026-05-28",
      },
    });

    expect(memory.workingMemory.collected).toMatchObject({
      city: "Novi Sad",
      service: "feniranje",
      date: "2026-05-28",
    });
  });

  it("missingFields includes city when city is absent", () => {
    const memory = buildAgentMemoryContext({
      bookingFlowCollected: { service: "masaža" },
    });

    expect(memory.workingMemory.missingFields).toContain("city");
  });

  it("missingFields does not include city when city exists", () => {
    const memory = buildAgentMemoryContext({
      bookingFlowCollected: { service: "masaža", city: "Bor" },
    });

    expect(memory.workingMemory.missingFields).not.toContain("city");
  });

  it("procedural memory contains modal ownership rule", () => {
    const procedural = getProceduralMemory();
    const allRules = Object.values(procedural).flat();

    expect(allRules).toContain("AI must never directly open modal, render blocks, or confirm booking.");
  });

  it("formatted prompt is compact and not raw huge JSON", () => {
    const prompt = formatAgentMemoryForPrompt(
      buildAgentMemoryContext({
        activeAgent: "claudia",
        bookingFlowCollected: {
          city: "Novi Sad",
          service: "feniranje",
          date: "2026-05-28",
          timeWindowStart: 13,
        },
        selectedSlot: { serviceName: "feniranje", city: "Novi Sad" },
      }),
    );

    expect(prompt.length).toBeLessThan(2000);
    expect(prompt).not.toContain('"workingMemory"');
    expect(prompt).not.toContain('"proceduralMemory"');
  });

  it("memory builder is pure and does not mutate input", () => {
    const bookingFlowCollected = {
      city: "Novi Sad",
      service: "feniranje",
      date: "2026-05-28",
    };
    const input = {
      activeAgent: "claudia",
      bookingFlowCollected,
      selectedSlot: { serviceName: "feniranje" },
    };
    const before = JSON.stringify(input);

    buildAgentMemoryContext(input);

    expect(JSON.stringify(input)).toBe(before);
    expect(bookingFlowCollected).toEqual({
      city: "Novi Sad",
      service: "feniranje",
      date: "2026-05-28",
    });
  });

  it("SystemActionEvent is referenced as non-user text in procedural memory", () => {
    const procedural = getProceduralMemory();
    const allRules = Object.values(procedural).flat().join("\n");

    expect(allRules).toContain("AI must not treat SystemActionEvent as user text.");
  });
});

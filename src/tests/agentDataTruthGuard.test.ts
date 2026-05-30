import {
  formatNearestSalonAnswer,
  formatSalonExistenceAnswer,
  resolveCityServiceAvailability,
  validateAgentClaim,
} from "@/lib/ai/guards/agent-data-truth-guard";
import { routeUserMessageToAgent } from "@/lib/ai/routing/agentEntryRouter";
import { askAgent } from "@/services/askAgent";
import type { PlatformKnowledge } from "@/lib/ai/platform-knowledge";
import type { SemanticMemory } from "@/lib/ai/memory/agent-memory-types";

const semanticMemory: SemanticMemory = {
  categories: [
    { key: "hair", label: "Kosa", synonyms: ["frizer", "feniranje"], subcategories: [] },
    { key: "massage", label: "Masaža", synonyms: ["masaža"], subcategories: [] },
  ],
  services: [
    {
      key: "feniranje",
      label: "Feniranje",
      categoryKey: "hair",
      categoryLabel: "Kosa",
      synonyms: ["frizerski salon"],
      cities: ["Beograd"],
      salonIds: ["kiki"],
      salonNames: ["Kiki Kiss Beauty"],
    },
    {
      key: "masaza",
      label: "Masaža",
      categoryKey: "massage",
      categoryLabel: "Masaža",
      synonyms: ["masaža"],
      cities: ["Bor"],
      salonIds: ["massage"],
      salonNames: ["Beauty M Glow"],
    },
  ],
  cityServiceMap: {},
  serviceCityMap: {},
};

const platformKnowledge: PlatformKnowledge = {
  salonsText: "",
  servicesText: "",
  citiesText: "Beograd, Bor",
  categoriesText: "",
  raw: {
    salons: [
      { id: "kiki", _id: "kiki", name: "Kiki Kiss Beauty", city: "Beograd" },
      { id: "massage", _id: "massage", name: "Beauty M Glow", city: "Bor" },
    ],
    services: [
      { id: "fen", _id: "fen", name: "Feniranje", salonId: "kiki", _salonId: "kiki" },
      { id: "mas", _id: "mas", name: "Masaža", salonId: "massage", _salonId: "massage" },
    ],
    categories: [],
  },
  semanticMemory,
};

async function readStream(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    output += decoder.decode(value);
  }
  return output;
}

describe("agent data truth guard", () => {
  it("detects requestedCity Ruma vs salon.city Beograd", () => {
    expect(
      validateAgentClaim({
        agent: "maria",
        requestedCity: "Ruma",
        salon: { name: "Kiki Kiss Beauty", city: "Beograd" },
        message: "Da, imamo salon u Rumi.",
      }),
    ).toMatchObject({ valid: false, reason: "city_mismatch" });
  });

  it("detects requestedCity Ruma vs slot.city Beograd", () => {
    expect(
      validateAgentClaim({
        agent: "claudia",
        requestedCity: "Ruma",
        slot: { salonName: "Kiki Kiss Beauty", city: "Beograd" },
        message: "Imamo slobodne termine u Rumi.",
      }),
    ).toMatchObject({ valid: false, reason: "city_mismatch" });
  });

  it("corrected message says no salon in Ruma, nearest Beograd", () => {
    const result = validateAgentClaim({
      agent: "claudia",
      requestedCity: "Ruma",
      slot: { salonName: "Kiki Kiss Beauty", city: "Beograd" },
      message: "Imamo slobodne termine u Rumi.",
    });

    expect(result.correctedMessage).toContain("Trenutno nemamo salon u Rumi");
    expect(result.correctedMessage).toContain("Kiki Kiss Beauty u Beogradu");
  });

  it("tražena usluga without service is invalid", () => {
    expect(
      validateAgentClaim({
        agent: "claudia",
        message: "Imamo slobodne termine za tražena usluga.",
      }),
    ).toMatchObject({ valid: false, reason: "missing_service" });
  });

  it("salon za salon is invalid_template", () => {
    expect(
      validateAgentClaim({
        agent: "maria",
        message: "Da, imamo salon za salon u Beogradu.",
      }),
    ).toMatchObject({ valid: false, reason: "invalid_template" });
  });

  it("Maria response boundary correction text removes salon za salon template", () => {
    const result = validateAgentClaim({
      agent: "maria",
      message: "Da, imamo salon za salon u Beogradu.",
    });

    expect(result.correctedMessage).toBe("Da, imamo salon u Beogradu.");
  });

  it("Claudia response boundary never says u Rumi for Beograd slot", () => {
    const result = validateAgentClaim({
      agent: "claudia",
      requestedCity: "Ruma",
      slot: { salonName: "Kiki Kiss Beauty", city: "Beograd" },
      message: "Pozdrav, imamo slobodne termine za Feniranje u Rumi.",
    });

    expect(result.correctedMessage).not.toContain("termine za Feniranje u Rumi");
    expect(result.correctedMessage).toContain("u Beogradu");
  });

  it("Claudia does not route to Maria for da li taj salon postoji u Rumi", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "claudia",
      hasActiveBooking: true,
      message: "Piše da je salon u Beogradu, da li taj salon postoji i u Rumi?",
    });

    expect(decision.targetAgent).toBe("claudia");
  });

  it("Claudia answers city mismatch itself", async () => {
    const stream = await askAgent(
      "Piše da je salon u Beogradu, da li taj salon postoji i u Rumi?",
      false,
      [],
      "Gost",
      false,
      {
        city: "Ruma",
        salonName: "Kiki Kiss Beauty",
        selectedSlot: {
          city: "Beograd",
          salonName: "Kiki Kiss Beauty",
          serviceName: "Feniranje",
        },
      } as never,
    );

    const output = await readStream(stream);
    expect(output).toContain("Ne, taj salon je u Beogradu");
    expect(output).toContain("U Rumi trenutno nemamo salon");
  });

  it("Ruma with no salons returns negative city fact", () => {
    const result = resolveCityServiceAvailability({
      city: "Ruma",
      platformKnowledge,
      semanticMemory,
    });

    expect(result.hasSalonInCity).toBe(false);
    expect(formatNearestSalonAnswer({
      requestedCity: "Ruma",
      alternative: result.nearestAlternatives[0],
    })).toContain("Trenutno nemamo salon u Rumi");
  });

  it("nearest alternative keeps actual city visible", () => {
    const answer = formatNearestSalonAnswer({
      requestedCity: "Ruma",
      alternative: { salonName: "Kiki Kiss Beauty", city: "Beograd" },
    });

    expect(answer).toContain("Rumi");
    expect(answer).toContain("Beogradu");
  });

  it("service/category known keeps nearest alternative category strict", () => {
    const result = resolveCityServiceAvailability({
      city: "Ruma",
      category: "Kosa",
      platformKnowledge,
      semanticMemory,
    });

    expect(result.nearestAlternatives[0]?.salonName).toBe("Kiki Kiss Beauty");
    expect(result.nearestAlternatives.some((item) => item.salonName === "Beauty M Glow")).toBe(false);
  });

  it("generic nearest salon works when service unknown", () => {
    const result = resolveCityServiceAvailability({
      city: "Ruma",
      platformKnowledge,
      semanticMemory,
    });

    expect(result.nearestAlternatives.length).toBeGreaterThan(0);
  });

  it("formats salon existence mismatch without pingpong wording", () => {
    expect(
      formatSalonExistenceAnswer({
        requestedCity: "Ruma",
        actualCity: "Beograd",
        salonName: "Kiki Kiss Beauty",
      }),
    ).toBe("Ne, taj salon je u Beogradu. U Rumi trenutno nemamo salon na platformi.");
  });
});

import {
  detectClosureIntent,
  detectServiceInCityIntent,
  extractLastMentionedCity,
  extractLastServiceOrCategory,
  buildServiceAvailabilityInfoMessage,
  resolveNearestSalonForCategory,
} from "@/app/api/ai/deepseek-conversation/route";
import { routeUserMessageToAgent } from "@/lib/ai/routing/agentEntryRouter";
import type { SemanticMemory } from "@/lib/ai/memory/agent-memory-types";
import type { PlatformSalon } from "@/lib/api/platformClient";

const semanticMemory: SemanticMemory = {
  categories: [],
  services: [
    {
      key: "feniranje",
      label: "Feniranje",
      categoryKey: "hair",
      categoryLabel: "Kosa",
      synonyms: ["frizer", "frizerski salon", "šišanje", "feniranje"],
      cities: ["Novi Sad"],
      salonIds: ["shi-sham"],
      salonNames: ["Shi Sham Frizerski Salon"],
    },
  ],
  cityServiceMap: {},
  serviceCityMap: {},
};

const salons: PlatformSalon[] = [
  { id: "shi-sham", name: "Shi Sham Frizerski Salon", city: "Novi Sad" },
  { id: "massage-1", name: "Beauty M Glow", city: "Bor" },
];

describe("Maria closure and continuation context", () => {

  it("ne hvala returns U redu, no handoff", () => {
    const contract = detectClosureIntent("ne hvala", { hasPreviousAssistantMessage: true });

    expect(contract?.message).toBe("U redu.");
    expect(contract?.routing.shouldHandoff).toBe(false);
  });

  it("doviđenja returns closure", () => {
    expect(detectClosureIntent("doviđenja")?.message).toBe("Doviđenja!");
  });

  it("ćao Maria as first message remains greeting, not closure", () => {
    expect(
      detectClosureIntent("ćao Maria", {
        isFirstMessage: true,
        hasPreviousAssistantMessage: false,
      }),
    ).toBeNull();
  });

  it("u redu while confirming booking is not closure", () => {
    expect(
      detectClosureIntent("u redu", {
        aiBookingState: "awaiting_confirmation",
        lastAssistantMessage: "Da li želite da potvrdimo termin?",
        hasPreviousAssistantMessage: true,
      }),
    ).toBeNull();
  });

  it("extractLastMentionedCity finds Ruma", () => {
    expect(
      extractLastMentionedCity(
        [
          { role: "user", content: "Da li ima frizerski salon u mom gradu?" },
          { role: "assistant", content: "Koji grad?" },
          { role: "user", content: "Ruma" },
        ],
        ["Ruma", "Novi Sad"],
      ),
    ).toBe("Ruma");
  });

  it("extractLastMentionedCity handles Leskovac locative Leskovcu", () => {
    expect(
      extractLastMentionedCity(
        [{ role: "user", content: "Interesuje me frizerski salon u Leskovcu" }],
        ["Leskovac"],
      ),
    ).toBe("Leskovac");
  });

  it("detectServiceInCityIntent catches service plus city without booking keyword", () => {
    expect(
      detectServiceInCityIntent("Feniranje i Frizure za vencanje u Leskovcu", [
        "Leskovac",
      ]),
    ).toMatchObject({
      city: "Leskovac",
    });
  });

  it("service plus unsupported city answers clearly instead of asking for city again", () => {
    const message = buildServiceAvailabilityInfoMessage({
      city: "Leskovac",
      service: "frizerski salon",
      platform: {
        salonsText: "",
        servicesText: "",
        citiesText: "Novi Sad",
        categoriesText: "",
        raw: {
          salons,
          services: [],
          categories: [],
        },
        semanticMemory,
      },
    });

    expect(message).toContain("Leskovac");
    expect(message).toContain("Trenutno nemamo");
    expect(message).not.toContain("napišite grad");
  });

  it("nearest hair salon from Ruma returns Shi Sham / Novi Sad", () => {
    const nearest = resolveNearestSalonForCategory({
      fromCity: "Ruma",
      category: "Kosa",
      semanticMemory,
      salons,
    });

    expect(nearest).toMatchObject({
      salonName: "Shi Sham Frizerski Salon",
      city: "Novi Sad",
      exactCity: false,
    });
  });

  it("nearest query with no known city asks one clear question", () => {
    expect(extractLastMentionedCity([{ role: "user", content: "koji imate najbliži" }], [])).toBeUndefined();
  });

  it("nearest query with no known category asks one clear question", () => {
    expect(extractLastServiceOrCategory([{ role: "user", content: "koji imate najbliži" }], semanticMemory)).toBeUndefined();
  });

  it("nearest answer now routes to Claudia as default booking concierge", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "koji imate najbliži",
    });

    expect(decision.targetAgent).toBe("claudia");
  });

  it("zakaži šišanje sutra still routes to Claudia", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "zakaži šišanje sutra",
    });

    expect(decision.targetAgent).toBe("claudia");
  });

  it("kako da zakažem routes to Claudia", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "kako da zakažem",
    });

    expect(decision.targetAgent).toBe("claudia");
  });
});

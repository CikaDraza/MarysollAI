import { interpretUserMessage } from "@/lib/ai/semantic-interpreter/interpretUserMessage";
import { meaningToMariaContract } from "@/lib/ai/semantic-interpreter/meaningToMariaDecision";
import {
  MeaningCandidateSchema,
  parseMeaningCandidate,
  type MeaningCandidate,
} from "@/lib/ai/semantic-interpreter/semantic-interpreter.schema";
import type { AgentMemoryContext, SemanticMemory } from "@/lib/ai/memory/agent-memory-types";
import type { PlatformKnowledge } from "@/lib/ai/platform-knowledge";

const semanticMemory: SemanticMemory = {
  categories: [
    { key: "hair", label: "Kosa", synonyms: ["frizerski", "feniranje"], subcategories: [] },
  ],
  services: [
    {
      key: "feniranje",
      label: "Feniranje",
      categoryKey: "hair",
      categoryLabel: "Kosa",
      synonyms: ["frizerski salon", "frizure za venčanje", "frizure za vencanje"],
      cities: ["Novi Sad"],
      salonIds: ["shi-sham"],
      salonNames: ["Shi Sham Frizerski Salon"],
    },
  ],
  cityServiceMap: {},
  serviceCityMap: {},
};

const platformKnowledge: PlatformKnowledge = {
  salonsText: "",
  servicesText: "",
  citiesText: "Novi Sad, Bor",
  categoriesText: "Kosa",
  raw: {
    salons: [{ id: "shi-sham", name: "Shi Sham Frizerski Salon", city: "Novi Sad" }],
    services: [],
    categories: [],
  },
  semanticMemory,
};

function memoryContext(collected: AgentMemoryContext["workingMemory"]["collected"]): AgentMemoryContext {
  return {
    workingMemory: {
      activeAgent: "maria",
      collected,
      missingFields: [],
    },
    proceduralMemory: {
      agentRoles: [],
      systemOwnershipRules: [],
      workflowRules: [],
      recoveryRules: [],
      uiRules: [],
      communicationRules: [],
    },
    semanticMemory,
  };
}

describe("semantic interpreter", () => {
  const originalKey = process.env.DEEPSEEK_API_KEY;

  beforeEach(() => {
    delete process.env.DEEPSEEK_API_KEY;
  });

  afterAll(() => {
    process.env.DEEPSEEK_API_KEY = originalKey;
  });

  it("parses Feniranje i Frizure za vencanje u Leskovcu as city Leskovac and category Kosa", async () => {
    const candidate = await interpretUserMessage({
      text: "Feniranje i Frizure za vencanje u Leskovcu",
      semanticMemory,
      platformKnowledge,
    });

    expect(candidate.entities.city).toBe("Leskovac");
    expect(candidate.entities.category).toBe("Kosa");
    expect(candidate.entities.services?.join(" ")).toMatch(/Feniranje|feniranje/i);
  });

  it("does not classify clear service city message as unknown", async () => {
    const candidate = await interpretUserMessage({
      text: "Feniranje i Frizure za vencanje u Leskovcu",
      semanticMemory,
      platformKnowledge,
    });

    expect(candidate.utteranceType).not.toBe("unknown");
    expect(candidate.userGoal).toBe("check_existence");
  });

  it("parses frizerski salon in Leskovcu with free slots as check availability", async () => {
    const candidate = await interpretUserMessage({
      text: "Interesuje me frizerski salon u Leskovcu da li ima slobodne termine",
      semanticMemory,
      platformKnowledge,
    });

    expect(candidate.userGoal).toBe("check_availability");
    expect(candidate.entities.city).toBe("Leskovac");
    expect(candidate.entities.category).toBe("Kosa");
  });

  it("parses hvala, u redu as close conversation", async () => {
    const candidate = await interpretUserMessage({
      text: "hvala, u redu",
      semanticMemory,
      platformKnowledge,
    });

    expect(candidate.userGoal).toBe("close_conversation");
  });

  it("uses memory for koji imate najbliži", async () => {
    const candidate = await interpretUserMessage({
      text: "koji imate najbliži",
      memoryContext: memoryContext({ city: "Ruma", category: "Kosa" }),
      semanticMemory,
      platformKnowledge,
    });

    expect(candidate.entities.city).toBe("Ruma");
    expect(candidate.entities.category).toBe("Kosa");
  });

  it("unknown gibberish returns unknown safe fallback", async () => {
    const candidate = await interpretUserMessage({
      text: "asdfg qqq zzz",
      semanticMemory,
      platformKnowledge,
    });

    expect(candidate.utteranceType).toBe("unknown");
    expect(candidate.shouldAskClarification).toBe(true);
  });

  it("close conversation maps to Maria answer without handoff", () => {
    const contract = meaningToMariaContract({
      utteranceType: "thanks",
      userGoal: "close_conversation",
      confidence: 0.99,
      entities: {},
      ambiguity: { missing: [], alternatives: [] },
      shouldAskClarification: false,
    });

    expect(contract.routing.shouldHandoff).toBe(false);
    expect(contract.intent.domain).toBe("faq");
  });

  it("check availability maps to Claudia handoff", () => {
    const contract = meaningToMariaContract({
      utteranceType: "availability_search",
      userGoal: "check_availability",
      confidence: 0.92,
      entities: { city: "Leskovac", category: "Kosa" },
      ambiguity: { missing: [], alternatives: [] },
      shouldAskClarification: false,
    });

    expect(contract.routing.shouldHandoff).toBe(true);
    expect(contract.routing.targetAgent).toBe("claudia");
  });

  it("check existence maps to Maria answer without handoff", () => {
    const contract = meaningToMariaContract(
      {
        utteranceType: "service_city_question",
        userGoal: "check_existence",
        confidence: 0.86,
        entities: { city: "Leskovac", category: "Kosa" },
        ambiguity: { missing: [], alternatives: [] },
        shouldAskClarification: false,
      },
      { platformKnowledge },
    );

    expect(contract.routing.shouldHandoff).toBe(false);
    expect(contract.intent.entities.city).toBe("Leskovac");
  });

  it("city with no salons remains extracted city, not clarification", () => {
    const contract = meaningToMariaContract(
      {
        utteranceType: "service_city_question",
        userGoal: "check_existence",
        confidence: 0.86,
        entities: { city: "Leskovac", category: "Kosa" },
        ambiguity: { missing: [], alternatives: [] },
        shouldAskClarification: false,
      },
      { platformKnowledge },
    );

    expect(contract.kind).toBe("faq_answer");
    expect(contract.intent.entities.city).toBe("Leskovac");
    expect(contract.message).toMatch(/Leskovc/);
  });

  it("interpreter never returns UI or block commands", async () => {
    const candidate = await interpretUserMessage({
      text: "Feniranje u Leskovcu",
      semanticMemory,
      platformKnowledge,
    });

    expect(JSON.stringify(candidate)).not.toMatch(/block|modal|uiCommand|system_action/i);
  });

  it("interpreter output passes Zod", async () => {
    const candidate = await interpretUserMessage({
      text: "Feniranje u Leskovcu",
      semanticMemory,
      platformKnowledge,
    });

    expect(MeaningCandidateSchema.safeParse(candidate).success).toBe(true);
  });

  it("low confidence maps to one clarification question", () => {
    const contract = meaningToMariaContract({
      utteranceType: "unknown",
      userGoal: "clarify",
      confidence: 0.3,
      entities: {},
      ambiguity: { missing: ["city"], alternatives: [] },
      shouldAskClarification: true,
    });

    expect(contract.kind).toBe("clarification");
    expect(contract.message).toBe("Za koji grad da proverim?");
  });

  it("existing deterministic FAQ wins before LLM", async () => {
    const candidate = await interpretUserMessage({
      text: "Kako da zakažem?",
      semanticMemory,
      platformKnowledge,
    });

    expect(candidate.utteranceType).toBe("faq");
    expect(candidate.userGoal).toBe("ask_information");
    expect(candidate.confidence).toBeGreaterThan(0.9);
  });

  it("parseMeaningCandidate safely normalizes raw LLM JSON", () => {
    const candidate: MeaningCandidate = parseMeaningCandidate(
      '{"utteranceType":"availability_search","userGoal":"check_availability","confidence":2,"entities":{"city":"Leskovac"},"shouldAskClarification":false}',
    );

    expect(candidate.confidence).toBe(1);
    expect(candidate.entities.city).toBe("Leskovac");
  });
});

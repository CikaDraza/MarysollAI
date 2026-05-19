import {
  legacyMariaResponseToContract,
  MARIA_CONTRACT_FALLBACK,
  mariaContractToLegacyResponse,
  parseMariaContract,
  type MariaContract,
} from "@/lib/ai/schemas/maria-contract.schema";

const bookingContract: MariaContract = {
  kind: "intent",
  message: "Tražim slobodne termine za tebe.",
  intent: {
    domain: "booking",
    action: "search_slots",
    confidence: 0.92,
    entities: {
      city: "Beograd",
      service: "šminkanje",
      date: "2026-05-20",
      timeWindowStart: 15,
      timeWindowEnd: null,
    },
    missingFields: [],
  },
  routing: {
    shouldHandoff: true,
    targetAgent: "claudia",
    reason: "booking_intent",
  },
};

describe("MariaContract schema", () => {
  it("parses valid object", () => {
    const parsed = parseMariaContract(bookingContract);

    expect(parsed).toMatchObject({
      kind: "intent",
      intent: {
        domain: "booking",
        action: "search_slots",
        entities: { city: "Beograd", service: "šminkanje" },
      },
      routing: { shouldHandoff: true, targetAgent: "claudia" },
    });
  });

  it("parses JSON string", () => {
    const parsed = parseMariaContract(JSON.stringify(bookingContract));

    expect(parsed.intent.domain).toBe("booking");
    expect(parsed.intent.entities.timeWindowStart).toBe(15);
  });

  it("strips code fences", () => {
    const parsed = parseMariaContract(
      "```json\n" + JSON.stringify(bookingContract) + "\n```",
    );

    expect(parsed.kind).toBe("intent");
    expect(parsed.intent.action).toBe("search_slots");
  });

  it("recovers trailing prose", () => {
    const parsed = parseMariaContract(
      `Evo JSON:\n${JSON.stringify(bookingContract)}\nNastavak teksta.`,
    );

    expect(parsed.intent.entities.city).toBe("Beograd");
  });

  it("malformed input returns fallback", () => {
    const parsed = parseMariaContract("{ bad json");

    expect(parsed).toEqual(MARIA_CONTRACT_FALLBACK);
  });

  it("confidence clamps invalid range safely", () => {
    const parsed = parseMariaContract({
      ...bookingContract,
      intent: {
        ...bookingContract.intent,
        confidence: 2,
      },
    });

    expect(parsed.intent.confidence).toBe(1);
  });

  it("faq contract converts to legacy answer", () => {
    const legacy = mariaContractToLegacyResponse({
      kind: "faq_answer",
      message: "Možete zakazati kao gost.",
      intent: {
        domain: "faq",
        action: "answer_question",
        confidence: 0.95,
        entities: {},
        missingFields: [],
      },
      routing: {
        shouldHandoff: false,
        targetAgent: "maria",
        reason: "faq_answered",
      },
    });

    expect(legacy).toEqual({
      type: "answer",
      message: "Možete zakazati kao gost.",
      targetAgent: "none",
    });
  });

  it("booking contract converts to legacy handoff booking", () => {
    const legacy = mariaContractToLegacyResponse(bookingContract);

    expect(legacy).toMatchObject({
      type: "handoff",
      targetAgent: "booking",
      payload: {
        intent: "booking",
        city: "Beograd",
        service: "šminkanje",
        timeWindowStart: 15,
      },
    });
  });

  it("appointments contract converts to legacy handoff appointments", () => {
    const legacy = mariaContractToLegacyResponse({
      ...bookingContract,
      intent: {
        domain: "appointments",
        action: "view_appointments",
        confidence: 0.9,
        entities: {},
        missingFields: [],
      },
    });

    expect(legacy).toMatchObject({
      type: "handoff",
      targetAgent: "appointments",
      payload: { intent: "appointments" },
    });
  });

  it("auth contract converts to legacy handoff auth", () => {
    const legacy = mariaContractToLegacyResponse({
      ...bookingContract,
      routing: { shouldHandoff: true, targetAgent: "auth", reason: "login_request" },
      intent: {
        domain: "auth",
        action: "login",
        confidence: 0.88,
        entities: {},
        missingFields: [],
      },
    });

    expect(legacy).toMatchObject({
      type: "handoff",
      targetAgent: "auth",
      payload: { intent: "login" },
    });
  });

  it("notify_me contract converts to Claudia-compatible handoff", () => {
    const legacy = mariaContractToLegacyResponse({
      ...bookingContract,
      intent: {
        domain: "notify_me",
        action: "create_notify_watch",
        confidence: 0.82,
        entities: {
          city: "Novi Sad",
          service: "feniranje",
        },
        missingFields: [],
      },
    });

    expect(legacy).toMatchObject({
      type: "handoff",
      targetAgent: "booking",
      payload: {
        intent: "booking",
        action: "create_notify_watch",
        city: "Novi Sad",
        service: "feniranje",
      },
    });
  });

  it("legacy MariaResponse converts to contract", () => {
    const contract = legacyMariaResponseToContract({
      type: "handoff",
      message: "U redu, zovem Claudiu za termine.",
      targetAgent: "appointments",
      payload: { intent: "appointments" },
    });

    expect(contract).toMatchObject({
      kind: "intent",
      intent: {
        domain: "appointments",
        action: "view_appointments",
        confidence: 1,
      },
      routing: {
        shouldHandoff: true,
        targetAgent: "claudia",
        reason: "legacy_handoff",
      },
    });
  });

  it("legacy notify handoff converts back to notify_me contract", () => {
    const contract = legacyMariaResponseToContract({
      type: "handoff",
      message: "Pripremam obaveštenje.",
      targetAgent: "booking",
      payload: {
        intent: "booking",
        action: "create_notify_watch",
        service: "feniranje",
      } as Record<string, unknown>,
    });

    expect(contract).toMatchObject({
      kind: "intent",
      intent: {
        domain: "notify_me",
        action: "create_notify_watch",
        entities: { service: "feniranje" },
      },
      routing: {
        shouldHandoff: true,
        targetAgent: "claudia",
      },
    });
  });
});

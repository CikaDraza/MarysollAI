import {
  CLAUDIA_CONTRACT_FALLBACK,
  claudiaContractToLegacyResponse,
  legacyClaudiaResponseToContract,
  parseClaudiaContract,
  type ClaudiaContract,
} from "@/lib/ai/schemas/claudia-contract.schema";
import type { BaseBlock } from "@/types/landing-block";

const baseContract: ClaudiaContract = {
  kind: "booking_result",
  message: "Pronašla sam slobodne termine.",
  workflow: {
    domain: "booking",
    step: "show_slots",
    status: "ready",
  },
  nextAction: {
    type: "SHOW_SLOTS",
    reason: "booking_search",
  },
  ui: {
    blocks: [],
    hideBlocks: [],
    showBlocks: [],
  },
  intent: {
    type: "booking",
    confidence: 0.95,
    entities: {
      service: "feniranje",
      city: "Novi Sad",
      timeWindowStart: 15,
      timeWindowEnd: null,
      slots: [
        {
          salonId: "salon-1",
          salonName: "Shi Sham",
          serviceName: "Feniranje",
          city: "Novi Sad",
          timeLabel: "15:30",
        },
      ],
    },
    missingFields: [],
  },
};

describe("ClaudiaContract schema", () => {
  it("booking_result with SHOW_SLOTS converts to AppointmentCalendarBlock layout", () => {
    const legacy = claudiaContractToLegacyResponse(baseContract);

    expect(legacy.messages[0]).toMatchObject({
      role: "assistant",
      content: "Pronašla sam slobodne termine.",
      attachToBlockType: "AppointmentCalendarBlock",
    });
    expect(legacy.layout[0]).toMatchObject({
      type: "AppointmentCalendarBlock",
      priority: 1,
      metadata: {
        service: "feniranje",
        city: "Novi Sad",
        timeWindowStart: 15,
        timeWindowEnd: null,
      },
    });
    expect(legacy.intent).toMatchObject({ type: "booking", city: "Novi Sad" });
  });

  it("clarification converts to assistant message without layout", () => {
    const legacy = claudiaContractToLegacyResponse({
      ...baseContract,
      kind: "clarification",
      message: "Koji grad želiš?",
      workflow: { domain: "booking", step: "missing_city", status: "waiting_for_user" },
      nextAction: { type: "ASK_CLARIFICATION", reason: "missing_city" },
      intent: {
        type: "booking",
        confidence: 0.6,
        entities: { service: "feniranje" },
        missingFields: ["city"],
      },
    });

    expect(legacy.messages[0]).toMatchObject({
      role: "assistant",
      content: "Koji grad želiš?",
    });
    expect(legacy.messages[0].attachToBlockType).toBeUndefined();
    expect(legacy.layout).toEqual([]);
  });

  it("appointments converts to CalendarBlock layout", () => {
    const legacy = claudiaContractToLegacyResponse({
      ...baseContract,
      kind: "appointments",
      message: "Pozdrav, izvolite vaše termine.",
      workflow: { domain: "appointments", step: "list", status: "ready" },
      nextAction: { type: "SHOW_APPOINTMENTS", reason: "appointments_view" },
      intent: {
        type: "appointments",
        confidence: 0.95,
        entities: { mode: "list", appointmentListMode: "all" },
        missingFields: [],
      },
    });

    expect(legacy.layout[0]).toMatchObject({
      type: "CalendarBlock",
      metadata: { mode: "list", appointmentListMode: "all" },
    });
    expect(legacy.intent).toMatchObject({ type: "appointments" });
  });

  it("prices converts to ServicePriceBlock when salon is known", () => {
    const legacy = claudiaContractToLegacyResponse({
      ...baseContract,
      kind: "prices",
      message: "Otvaram cenovnik salona.",
      workflow: { domain: "prices", step: "show_service_prices", status: "ready" },
      nextAction: { type: "SHOW_PRICES", reason: "prices_for_salon" },
      intent: {
        type: "prices",
        confidence: 0.9,
        entities: { salonId: "salon-1", salonName: "Shi Sham", service: "feniranje" },
        missingFields: [],
      },
    });

    expect(legacy.layout[0]).toMatchObject({
      type: "ServicePriceBlock",
      metadata: { salonId: "salon-1", salonName: "Shi Sham", service: "feniranje" },
    });
  });

  it("prices converts to SalonListBlock when salon choice is still needed", () => {
    const legacy = claudiaContractToLegacyResponse({
      ...baseContract,
      kind: "prices",
      message: "Izaberi salon za cenovnik.",
      workflow: { domain: "prices", step: "choose_salon", status: "waiting_for_user" },
      nextAction: { type: "SHOW_PRICES", reason: "prices_need_salon" },
      intent: {
        type: "prices",
        confidence: 0.84,
        entities: {
          city: "Beograd",
          service: "šminkanje",
          salons: [{ id: "salon-1", name: "Salon 1" }],
        },
        missingFields: ["salonId"],
      },
    });

    expect(legacy.layout[0]).toMatchObject({
      type: "SalonListBlock",
      metadata: {
        city: "Beograd",
        service: "šminkanje",
        salons: [{ id: "salon-1", name: "Salon 1" }],
      },
    });
  });

  it("auth converts to AuthBlock layout", () => {
    const legacy = claudiaContractToLegacyResponse({
      ...baseContract,
      kind: "auth",
      message: "Prijavite se da nastavimo.",
      workflow: { domain: "auth", step: "login", status: "waiting_for_user" },
      nextAction: { type: "SHOW_AUTH", reason: "login_required" },
      intent: {
        type: "login",
        confidence: 0.95,
        entities: { mode: "login" },
        missingFields: [],
      },
    });

    expect(legacy.messages[0].attachToBlockType).toBe("AuthBlock");
    expect(legacy.layout[0]).toMatchObject({
      type: "AuthBlock",
      metadata: { mode: "login" },
    });
  });

  it("recovery slot_taken converts to AppointmentCalendarBlock with alternatives", () => {
    const alternatives = [
      {
        salonId: "salon-1",
        salonName: "Shi Sham",
        serviceName: "Feniranje",
        city: "Novi Sad",
        timeLabel: "16:30",
      },
    ];
    const legacy = claudiaContractToLegacyResponse({
      ...baseContract,
      kind: "recovery",
      message: "Taj termin je zauzet. Našla sam najbližu alternativu.",
      workflow: { domain: "recovery", step: "slot_taken", status: "ready" },
      nextAction: { type: "SHOW_RECOVERY_ALTERNATIVES", reason: "slot_taken" },
      intent: {
        type: "booking_conflict",
        confidence: 0.98,
        entities: {
          service: "feniranje",
          city: "Novi Sad",
          alternatives,
        },
        missingFields: [],
      },
    });

    expect(legacy.layout[0]).toMatchObject({
      type: "AppointmentCalendarBlock",
      metadata: { slots: alternatives },
    });
    expect(legacy.intent).toMatchObject({ type: "booking_conflict" });
  });

  it("malformed input returns fallback contract", () => {
    expect(parseClaudiaContract("{ nope")).toEqual(CLAUDIA_CONTRACT_FALLBACK);
  });

  it("parses JSON strings and code fences", () => {
    const parsed = parseClaudiaContract(
      "```json\n" + JSON.stringify(baseContract) + "\n```",
    );

    expect(parsed).toMatchObject({
      kind: "booking_result",
      nextAction: { type: "SHOW_SLOTS" },
      intent: { entities: { city: "Novi Sad" } },
    });
  });

  it("legacy response converts to contract", () => {
    const legacy = {
      messages: [
        {
          id: "msg-1",
          type: "message",
          role: "assistant",
          content: "Pronašla sam slobodne termine.",
          attachToBlockType: "AppointmentCalendarBlock",
        },
      ],
      layout: [
        {
          type: "AppointmentCalendarBlock",
          priority: 1,
          metadata: {
            serviceId: "",
            serviceName: "Feniranje",
            variantName: "",
            service: "feniranje",
            city: "Novi Sad",
          },
        },
      ] as BaseBlock[],
      intent: { type: "booking", city: "Novi Sad" },
    } as Parameters<typeof legacyClaudiaResponseToContract>[0];

    const contract = legacyClaudiaResponseToContract(legacy);

    expect(contract).toMatchObject({
      kind: "booking_result",
      message: "Pronašla sam slobodne termine.",
      workflow: { domain: "booking", status: "ready" },
      nextAction: { type: "SHOW_SLOTS" },
      intent: {
        type: "booking",
        entities: { service: "feniranje", city: "Novi Sad" },
      },
    });
  });
});

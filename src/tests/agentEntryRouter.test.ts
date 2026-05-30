import {
  acknowledgementReply,
  isMariaOwnedIntent,
  routeUserMessageToAgent,
} from "@/lib/ai/routing/agentEntryRouter";

describe("agent entry router ownership inversion", () => {
  it("routes booking directly to Claudia", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "Želim da zakažem šminkanje u Kiki Kiss za nedelju",
    });

    expect(decision.targetAgent).toBe("claudia");
    expect(decision.claudiaSubAgent).toBe("booking");
    expect(decision.reason).toBe("direct_booking");
  });

  it("routes price list directly to Claudia", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "Mogu li da vidim cenovnik?",
    });

    expect(decision.targetAgent).toBe("claudia");
    expect(decision.reason).toBe("default_booking_concierge");
  });

  it("routes salon existence directly to Claudia", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "Da li imate salon u Rumi?",
    });

    expect(decision.targetAgent).toBe("claudia");
    expect(decision.reason).toBe("default_booking_concierge");
  });

  it("routes registration FAQ directly to Claudia", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "Da li moram da se registrujem?",
    });

    expect(decision.targetAgent).toBe("claudia");
    expect(decision.reason).toBe("default_booking_concierge");
  });

  it("routes appointments directly to Claudia", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "Moji termini",
    });

    expect(decision.targetAgent).toBe("claudia");
    expect(decision.claudiaSubAgent).toBe("appointments");
    expect(decision.reason).toBe("direct_appointments");
  });

  it("routes slot conflict FAQ directly to Claudia", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "Šta ako je termin zauzet?",
    });

    expect(decision.targetAgent).toBe("claudia");
    expect(decision.reason).toBe("default_booking_concierge");
  });

  it("routes salon owner business questions to Maria", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "claudia",
      message: "Kako moj salon da bude deo Marysoll?",
    });

    expect(decision.targetAgent).toBe("maria");
    expect(decision.reason).toBe("b2b_marysoll_business");
  });

  it("routes salon application questions to Maria", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "claudia",
      message: "Želim da prijavim salon",
    });

    expect(decision.targetAgent).toBe("maria");
    expect(decision.reason).toBe("b2b_marysoll_business");
  });

  it("routes salon platform pricing to Maria", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "claudia",
      message: "Koliko košta platforma za salone?",
    });

    expect(decision.targetAgent).toBe("maria");
    expect(decision.reason).toBe("b2b_marysoll_business");
  });

  it("routes promotions to Maria/promo ownership", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "claudia",
      message: "Imate li promocije?",
    });

    expect(decision.targetAgent).toBe("maria");
    expect(decision.reason).toBe("promotion_marketing");
  });

  it("routes default unknown app query to Claudia, not Maria", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "Nedelja",
    });

    expect(decision.targetAgent).toBe("claudia");
    expect(decision.reason).toBe("default_booking_concierge");
  });

  it("keeps active booking follow-ups with Claudia", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "claudia",
      hasActiveBooking: true,
      message: "Hvala, može ipak u 15:00?",
    });

    expect(decision.targetAgent).toBe("claudia");
    expect(decision.claudiaSubAgent).toBe("booking");
    expect(decision.reason).toBe("booking_follow_up");
  });

  it("does not show visible handoff text for default Claudia route", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "Da li imate salon u Rumi?",
    });

    expect(decision.targetAgent).toBe("claudia");
    expect(decision.transitionMessage).toBeUndefined();
  });

  it("detects Maria-owned intents only for business/promo", () => {
    expect(isMariaOwnedIntent("Vlasnik sam salona, zanima me saradnja")).toBe(true);
    expect(isMariaOwnedIntent("Da li moram da se registrujem?")).toBe(false);
  });

  it("treats thanks as acknowledgement on active agent", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "claudia",
      message: "Hvala",
    });

    expect(decision.reason).toBe("acknowledgement");
    expect(decision.targetAgent).toBe("claudia");
    expect(acknowledgementReply("Hvala")).toBe("Nema na čemu.");
  });
});

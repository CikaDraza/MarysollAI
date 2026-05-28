import {
  acknowledgementReply,
  routeUserMessageToAgent,
} from "@/lib/ai/routing/agentEntryRouter";

describe("agent entry router", () => {
  it("routes clear first booking intent directly to Claudia", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "maderoterapija danas posle 12",
    });

    expect(decision.targetAgent).toBe("claudia");
    expect(decision.claudiaSubAgent).toBe("booking");
    expect(decision.reason).toBe("direct_booking");
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

  it("keeps FAQ and platform info with Maria", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "Da li može online plaćanje ili pretplata?",
    });

    expect(decision.targetAgent).toBe("maria");
    expect(decision.reason).toBe("faq_or_platform_info");
  });

  it("keeps booking how-to questions with Maria", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "Kako mogu da zakažem?",
    });

    expect(decision.targetAgent).toBe("maria");
    expect(decision.reason).toBe("faq_or_platform_info");
  });

  it("keeps registration questions with Maria", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "Da li moram da se registrujem?",
    });

    expect(decision.targetAgent).toBe("maria");
    expect(decision.reason).toBe("faq_or_platform_info");
  });

  it("keeps salon existence questions with Maria", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "Da li postoji salon u Sremskoj Mitrovici?",
    });

    expect(decision.targetAgent).toBe("maria");
  });

  it("keeps service salon existence questions with Maria", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "Da li postoji salon za masazu u Loznici?",
    });

    expect(decision.targetAgent).toBe("maria");
  });

  it("keeps hair salon existence questions with Maria", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "Da li imate frizerski salon u Sremskoj Mitrovici?",
    });

    expect(decision.targetAgent).toBe("maria");
    expect(decision.reason).toBe("faq_or_platform_info");
  });

  it("keeps Maria continuation after nearest-city offer with Maria", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "Može",
    });

    expect(decision.targetAgent).toBe("maria");
  });

  it("keeps city-only follow-up with Maria", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "Loznica",
    });

    expect(decision.targetAgent).toBe("maria");
  });

  it("treats thanks as acknowledgement, not a repeated intent", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "claudia",
      message: "Hvala",
    });

    expect(decision.reason).toBe("acknowledgement");
    expect(decision.targetAgent).toBe("claudia");
    expect(acknowledgementReply("Hvala")).toBe("Nema na čemu.");
  });

  it("treats ok as acknowledgement, not a repeated intent", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "U redu",
    });

    expect(decision.reason).toBe("acknowledgement");
    expect(decision.targetAgent).toBe("maria");
    expect(acknowledgementReply("U redu")).toBe("U redu.");
  });

  it("routes online payment wording with platim to Maria", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "claudia",
      message: "Da li mogu da platim online termin u salonu Beauty M Glow?",
    });

    expect(decision.targetAgent).toBe("maria");
    expect(decision.reason).toBe("faq_or_platform_info");
  });

  it("keeps service availability info questions with Maria", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "claudia",
      message: "Da li ima masaza tretman u Beogradu?",
    });

    expect(decision.targetAgent).toBe("maria");
    expect(decision.reason).toBe("faq_or_platform_info");
  });

  it("keeps service city list questions with Maria", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "Dajte mi gradove u kojima imate masazu?",
    });

    expect(decision.targetAgent).toBe("maria");
    expect(decision.reason).toBe("faq_or_platform_info");
  });

  it("keeps nearest salon questions with Maria", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "Koji je meni najbliži salon?",
    });

    expect(decision.targetAgent).toBe("maria");
    expect(decision.reason).toBe("faq_or_platform_info");
  });

  it("still routes service plus date/time directly to Claudia", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "maderoterapija danas posle 12",
    });

    expect(decision.targetAgent).toBe("claudia");
    expect(decision.claudiaSubAgent).toBe("booking");
  });

  it("routes explicit booking request with city and time to Claudia", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "maria",
      message: "Hoću termin za feniranje u Novom Sadu posle 15",
    });

    expect(decision.targetAgent).toBe("claudia");
    expect(decision.claudiaSubAgent).toBe("booking");
  });

  it("routes FAQ from Claudia back to Maria with a transition message", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "claudia",
      hasActiveBooking: true,
      message: "Da li može da se plati online?",
    });

    expect(decision.targetAgent).toBe("maria");
    expect(decision.reason).toBe("faq_or_platform_info");
    expect(decision.transitionMessage).toContain("Maria");
  });

  it("keeps active booking time corrections with Claudia", () => {
    const decision = routeUserMessageToAgent({
      activeAgent: "claudia",
      hasActiveBooking: true,
      message: "Hvala, može ipak u 15:00?",
    });

    expect(decision.targetAgent).toBe("claudia");
    expect(decision.claudiaSubAgent).toBe("booking");
    expect(decision.reason).toBe("booking_follow_up");
  });
});

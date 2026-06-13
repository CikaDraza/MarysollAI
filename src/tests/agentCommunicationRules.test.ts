import { buildMariaSystemPrompt } from "@/app/api/ai/deepseek-conversation/route";
import {
  getCommunicationExamples,
  getForbiddenAgentPhrases,
  getClaudiaCommunicationRules,
  sanitizeVisibleAgentMessage,
} from "@/lib/ai/communication/agent-communication-rules";
import { formatCommunicationRulesForPrompt } from "@/lib/ai/communication/formatCommunicationRulesForPrompt";
import { buildClaudiaSystemPrompt } from "@/services/askAgent";

describe("agent communication contract", () => {
  it("Maria communication examples do not mention Claudia as visible handoff", () => {
    const mariaExamples = getCommunicationExamples("maria")
      .map((example) => example.assistant)
      .join("\n");

    expect(mariaExamples).not.toContain("Prebacujem vas na Claudiu");
    expect(mariaExamples).not.toContain("Claudia će");
    expect(mariaExamples).not.toContain("Prosleđujem vas");
  });

  it("Claudia communication rules contain never lose context concept", () => {
    expect(getClaudiaCommunicationRules().join(" ")).toContain("Never lose context");
  });

  it("forbidden phrase list contains system_action", () => {
    expect(getForbiddenAgentPhrases()).toContain("system_action");
  });

  it("sanitizer removes salonId metadata", () => {
    expect(
      sanitizeVisibleAgentMessage("Izabrali ste Beauty M Glow [salonId:abc]."),
    ).toBe("Izabrali ste Beauty M Glow.");
  });

  it("sanitizer removes raw system_action text", () => {
    expect(
      sanitizeVisibleAgentMessage("system_action:BOOKING_CONFLICT Termin je zauzet."),
    ).toBe("Termin je zauzet.");
  });

  it("sanitizer removes flowVersion/actionId fragments", () => {
    expect(
      sanitizeVisibleAgentMessage("Spremno [flowVersion:12] [actionId:abc]."),
    ).toBe("Spremno.");
  });

  it("sanitizer preserves normal Serbian text", () => {
    const message = "Proveravam slobodne termine za sutra u Novom Sadu.";

    expect(sanitizeVisibleAgentMessage(message)).toBe(message);
  });

  it("Maria examples include guest booking FAQ", () => {
    const examples = getCommunicationExamples("maria");

    expect(examples.some((example) => example.assistant.includes("Možete zakazati i kao gost"))).toBe(true);
  });

  it("Claudia examples include follow-up time correction", () => {
    const examples = getCommunicationExamples("claudia");

    expect(examples.some((example) => example.user.includes("17h"))).toBe(true);
    expect(examples.some((example) => example.assistant.includes("17:00"))).toBe(true);
  });

  it("formatCommunicationRulesForPrompt is compact", () => {
    const prompt = formatCommunicationRulesForPrompt("maria");

    expect(prompt).toContain("# COMMUNICATION STYLE");
    expect(prompt).toContain("# MESSAGE INTENT");
    expect(prompt.length).toBeLessThan(2200);
  });

  it("Maria and Claudia system prompts include COMMUNICATION STYLE", () => {
    const mariaPrompt = buildMariaSystemPrompt("", "", "", "", "Gost", false, "", "sr");
    const claudiaPrompt = buildClaudiaSystemPrompt("", "", "", "", false, "Gost");

    expect(mariaPrompt).toContain("# COMMUNICATION STYLE");
    expect(claudiaPrompt).toContain("# COMMUNICATION STYLE");
  });

  it("Maria system prompt no longer uses forbidden visible handoff examples", () => {
    const prompt = buildMariaSystemPrompt("", "", "", "", "Gost", false, "", "sr");

    expect(prompt).not.toContain('"message":"Molim vas sačekajte, prebacujem vas na Claudiu');
    expect(prompt).not.toContain('"message":"Molim vas sačekajte, Claudia će');
  });
});

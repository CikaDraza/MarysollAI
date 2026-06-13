// src/tests/personaVoice.test.ts
//
// Faza 5 — persona cleanup. Jedinstveni glas oba agenta: topla recepcionerka,
// dosledno persiranje (Vi). Regression mreža da voice guide ostane u oba
// prompta i da kanonske poruke ne skliznu nazad u "ti" forme.

import { AGENT_VOICE_GUIDE } from "@/lib/ai/communication/agent-communication-rules";
import { formatCommunicationRulesForPrompt } from "@/lib/ai/communication/formatCommunicationRulesForPrompt";
import { buildMariaPrompt } from "@/lib/ai/communication/buildMariaPrompt";
import { buildClaudiaSystemPrompt } from "@/services/askAgent";
import type { PlatformKnowledge } from "@/lib/ai/platform-knowledge";

jest.mock("@/lib/api/platformClient", () => ({ platformClient: {} }));

const PLATFORM: PlatformKnowledge = {
  salonsText: "",
  servicesText: "",
  citiesText: "Beograd",
  categoriesText: "",
  raw: { salons: [], services: [], categories: [] },
  semanticMemory: undefined,
};

describe("Faza 5 — jedinstveni glas (voice guide)", () => {
  it("voice guide traži persiranje i ženski rod", () => {
    const joined = AGENT_VOICE_GUIDE.join(" ");
    expect(joined).toContain("Vi (persiranje)");
    expect(joined).toContain("ženskom rodu");
    expect(joined).toContain("recepcionerka");
  });

  it("voice guide ulazi u communication rules OBA agenta", () => {
    for (const agent of ["maria", "claudia"] as const) {
      const formatted = formatCommunicationRulesForPrompt(agent);
      expect(formatted).toContain("Vi (persiranje)");
      expect(formatted).toContain("recepcionerka");
    }
  });

  it("Maria prompt nalaže persiranje", () => {
    const prompt = buildMariaPrompt({
      platform: PLATFORM,
      userName: "Gost",
      isAuthenticated: false,
      userCity: "",
      language: "sr",
      conversationContext: {},
    });
    expect(prompt).toContain("sa Vi (persiranje)");
    expect(prompt).toContain("recepcionerka");
  });

  it("Claudia prompt nalaže persiranje i topao ton", () => {
    const prompt = buildClaudiaSystemPrompt("", "", "", "", false, "Gost", "");
    expect(prompt).toContain("sa Vi (persiranje)");
    expect(prompt).toContain("topla");
    // Stari robotski ton je uklonjen.
    expect(prompt).not.toContain("profesionalan, brz, jasan");
  });

  it("kanonski FAQ odgovor je u Vi formi", async () => {
    const { MARIA_KNOWN_FAQ_ANSWERS } = await import(
      "@/lib/ai/communication/agent-communication-rules"
    );
    expect(MARIA_KNOWN_FAQ_ANSWERS.registration_required).toContain("Ne morate");
    expect(MARIA_KNOWN_FAQ_ANSWERS.registration_required).not.toContain(
      "Ne moraš",
    );
  });
});

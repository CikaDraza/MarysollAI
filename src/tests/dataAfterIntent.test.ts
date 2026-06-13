// src/tests/dataAfterIntent.test.ts
//
// Faza 3 — podaci POSLE intenta.
// 1) Server (ne LLM) puni cities/salons liste u blokovima (enrichment).
// 2) Claudia prompt više ne traži od LLM-a da popunjava liste iz sekcija.
// 3) Maria prompt je na dijeti: bez pomenute usluge nema kataloga sa cenama.

jest.mock("@/lib/api/platformClient", () => ({
  platformClient: {},
}));

import {
  buildClaudiaSystemPrompt,
  enrichClaudiaLayoutBlocks,
} from "@/services/askAgent";
import { buildMariaPrompt } from "@/lib/ai/communication/buildMariaPrompt";
import type { PlatformKnowledge } from "@/lib/ai/platform-knowledge";

const PLATFORM: PlatformKnowledge = {
  salonsText: "",
  servicesText: "",
  citiesText: "Beograd, Novi Sad, Bor",
  categoriesText: "",
  raw: {
    salons: [
      { _id: "s-bg", name: "Kiki Kiss Beauty", city: "Beograd" },
      { _id: "s-ns", name: "Shi Sham Frizerski Salon", city: "Novi Sad" },
      { _id: "s-bor", name: "Beauty M Glow", city: "Bor" },
    ] as PlatformKnowledge["raw"] extends { salons: infer S } ? S : never,
    services: [
      {
        _id: "svc-1",
        name: "Maderoterapija",
        category: "Masaža",
        basePrice: 3500,
        duration: 60,
        salonId: "s-bor",
        salonName: "Beauty M Glow",
        city: "Bor",
      },
      {
        _id: "svc-2",
        name: "Feniranje",
        category: "Kosa",
        basePrice: 1500,
        duration: 45,
        salonId: "s-ns",
        salonName: "Shi Sham Frizerski Salon",
        city: "Novi Sad",
      },
    ] as NonNullable<PlatformKnowledge["raw"]>["services"],
    categories: [],
  },
  semanticMemory: undefined,
};

describe("Faza 3.3 — server puni liste u blokovima", () => {
  it("CityListBlock dobija cities iz snapshot-a (LLM ih nije naveo)", () => {
    const raw = JSON.stringify({
      messages: [{ role: "assistant", content: "Za koji grad?" }],
      layout: [
        {
          type: "CityListBlock",
          priority: 1,
          metadata: { service: "maderoterapija" },
        },
      ],
      intent: {},
    });
    const enriched = JSON.parse(
      enrichClaudiaLayoutBlocks(raw, { platform: PLATFORM }),
    );
    const cities = enriched.layout[0].metadata.cities;
    expect(Array.isArray(cities)).toBe(true);
    expect(cities).toEqual([{ name: "Bor", salonCount: 1 }]);
  });

  it("CityListBlock bez usluge dobija SVE gradove sa brojem salona", () => {
    const raw = JSON.stringify({
      messages: [{ role: "assistant", content: "Za koji grad?" }],
      layout: [{ type: "CityListBlock", priority: 1, metadata: {} }],
      intent: {},
    });
    const enriched = JSON.parse(
      enrichClaudiaLayoutBlocks(raw, { platform: PLATFORM }),
    );
    expect(enriched.layout[0].metadata.cities.map((c: { name: string }) => c.name)).toEqual([
      "Beograd",
      "Bor",
      "Novi Sad",
    ]);
  });

  it("SalonListBlock dobija salone iz snapshot-a, filtrirano po gradu i usluzi", () => {
    const raw = JSON.stringify({
      messages: [{ role: "assistant", content: "Evo salona." }],
      layout: [
        {
          type: "SalonListBlock",
          priority: 1,
          metadata: { city: "Bor", service: "maderoterapija" },
        },
      ],
      intent: {},
    });
    const enriched = JSON.parse(
      enrichClaudiaLayoutBlocks(raw, { platform: PLATFORM }),
    );
    const salons = enriched.layout[0].metadata.salons;
    expect(salons).toHaveLength(1);
    expect(salons[0].id).toBe("s-bor");
    expect(salons[0].name).toBe("Beauty M Glow");
  });

  it("LLM-ovi izmišljeni gradovi se PREPISUJU stvarnim podacima", () => {
    const raw = JSON.stringify({
      messages: [{ role: "assistant", content: "Za koji grad?" }],
      layout: [
        {
          type: "CityListBlock",
          priority: 1,
          metadata: { cities: [{ name: "Atlantida" }] },
        },
      ],
      intent: {},
    });
    const enriched = JSON.parse(
      enrichClaudiaLayoutBlocks(raw, { platform: PLATFORM }),
    );
    const names = enriched.layout[0].metadata.cities.map(
      (c: { name: string }) => c.name,
    );
    expect(names).not.toContain("Atlantida");
    expect(names).toContain("Beograd");
  });

  it("nevalidan JSON i prazan layout prolaze netaknuti", () => {
    expect(
      enrichClaudiaLayoutBlocks("nije json", { platform: PLATFORM }),
    ).toBe("nije json");
    const noLayout = JSON.stringify({ messages: [], layout: [], intent: {} });
    expect(enrichClaudiaLayoutBlocks(noLayout, { platform: PLATFORM })).toBe(
      noLayout,
    );
  });
});

describe("Faza 3.3 — Claudia prompt bez kataloških instrukcija za liste", () => {
  it("ne traži od LLM-a da popunjava liste iz sekcija; kaže da server puni", () => {
    const prompt = buildClaudiaSystemPrompt("", "", "", "", false, "Gost", "");
    expect(prompt).not.toContain("Popuni \"cities\" iz GRADOVI sekcije");
    expect(prompt).not.toContain("Popuni \"salons\" iz SALONI sekcije");
    expect(prompt).toContain("popunjava SERVER");
  });
});

describe("Faza 3.1 — Maria prompt na dijeti", () => {
  const base = {
    platform: PLATFORM,
    userName: "Gost",
    isAuthenticated: false,
    userCity: "",
    language: "sr",
  };

  it("bez pomenute usluge: nema kataloga usluga sa cenama", () => {
    const prompt = buildMariaPrompt({ ...base, conversationContext: {} });
    expect(prompt).not.toContain("RSD");
    expect(prompt).toContain("booking concierge");
    // Gradovi i saloni (postojanje) ostaju — to je njen FAQ domen.
    expect(prompt).toContain("Beograd");
    expect(prompt).toContain("Kiki Kiss Beauty");
  });

  it("sa pomenutom uslugom: top poklapanja bez cena", () => {
    const prompt = buildMariaPrompt({
      ...base,
      conversationContext: { mentionedService: "maderoterapija" },
    });
    expect(prompt).toContain("Maderoterapija");
    expect(prompt).not.toContain("3500");
    expect(prompt).not.toContain("RSD");
  });

  it("cenovnik primer rutira ka Claudii (ne odgovara cenama)", () => {
    const prompt = buildMariaPrompt({ ...base, conversationContext: {} });
    expect(prompt).toContain('"reason":"prices_handoff"');
    expect(prompt).not.toContain("1500 RSD");
  });
});

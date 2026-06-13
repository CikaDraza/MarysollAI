// src/tests/correctionFlow.test.ts
//
// Faza 4 — correction flow. Ključni zahtev: ako agent/korisnik pogreši prvi
// put, PONOVNI intent mora da poništi prethodni (revoke) — nova vrednost
// gazi staru, negirana vrednost se briše, a "nisam to želeo" bez detalja
// dobija rezime + pitanje umesto blokade.

import {
  askAgent,
  detectDirectCorrection,
} from "@/services/askAgent";
import { buildCatalogContext, type CatalogData } from "@/lib/ai/catalog/catalog-context";
import { platformClient } from "@/lib/api/platformClient";
import { bookingFlow } from "@/lib/ai/booking-flow-state";
import { handleAgentTransition } from "@/lib/ai/orchestrator/ai-orchestrator";
import { extractClearedFields } from "@/lib/ai/parseClaudiaResponse";

jest.mock("@/lib/api/platformClient", () => ({
  platformClient: {
    getSalonProfiles: jest.fn(),
    getSalonServices: jest.fn(),
  },
}));

jest.mock("@/lib/search/runBookingSearch", () => ({
  runBookingSearch: jest.fn().mockResolvedValue({
    results: [],
    slotsByCity: [],
    bestSlot: null,
    fallbackLevel: 0,
    totalSalons: 0,
    debug: {},
  }),
}));

const mockedPlatformClient = platformClient as jest.Mocked<typeof platformClient>;

const SALONS = [
  {
    _id: "salon-bg",
    name: "Kiki Kiss Beauty",
    city: "Beograd",
    services: [
      { _id: "svc-fen-bg", name: "Feniranje", category: "Kosa", basePrice: 1800 },
    ],
  },
  {
    _id: "salon-ns",
    name: "Shi Sham Frizerski Salon",
    city: "Novi Sad",
    services: [
      { _id: "svc-fen-ns", name: "Feniranje", category: "Kosa", basePrice: 1500 },
    ],
  },
];

const CATALOG_DATA: CatalogData = {
  cities: [{ name: "Beograd" }, { name: "Novi Sad" }, { name: "Bor" }],
  salons: [
    { id: "salon-bg", name: "Kiki Kiss Beauty", city: "Beograd" },
    { id: "salon-ns", name: "Shi Sham Frizerski Salon", city: "Novi Sad" },
  ],
  services: [],
  categories: [],
};

const catalog = buildCatalogContext(CATALOG_DATA);

async function readStream(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let full = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return full;
    full +=
      typeof value === "string" ? value : decoder.decode(value, { stream: true });
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  bookingFlow.get().reset();
  mockedPlatformClient.getSalonProfiles.mockResolvedValue(
    SALONS as unknown as Awaited<
      ReturnType<typeof platformClient.getSalonProfiles>
    >,
  );
  mockedPlatformClient.getSalonServices.mockResolvedValue([]);
});

describe("4.1 — clearFields", () => {
  it("briše navedena polja, ostala ostaju", () => {
    bookingFlow.get().collect({
      service: "feniranje",
      city: "Beograd",
      date: "2026-06-13",
      salonId: "salon-bg",
    });
    bookingFlow.get().clearFields(["date", "salonId"]);
    expect(bookingFlow.get().collected.date).toBeUndefined();
    expect(bookingFlow.get().collected.salonId).toBeUndefined();
    expect(bookingFlow.get().collected.service).toBe("feniranje");
    expect(bookingFlow.get().collected.city).toBe("Beograd");
  });
});

describe("4.2 — detectDirectCorrection", () => {
  const collected = {
    service: "feniranje",
    city: "Beograd",
    salonId: "salon-bg",
    salonName: "Kiki Kiss Beauty",
  };

  it("bez konteksta nema korekcije", () => {
    const result = detectDirectCorrection({
      text: "Nisam to želeo",
      catalog,
      collected: {},
    });
    expect(result.isCorrection).toBe(false);
  });

  it("'ne u Beogradu nego u Novom Sadu' menja grad i PONIŠTAVA salon", () => {
    const result = detectDirectCorrection({
      text: "Ne u Beogradu nego u Novom Sadu",
      catalog,
      collected,
    });
    expect(result.isCorrection).toBe(true);
    expect(result.vague).toBe(false);
    expect(result.replace.city).toBe("Novi Sad");
    expect(result.remove).toEqual(
      expect.arrayContaining(["salonId", "salonName"]),
    );
  });

  it("'umesto feniranja hoću masažu' menja uslugu i briše serviceId/salon", () => {
    const result = detectDirectCorrection({
      text: "umesto feniranja hoću masažu",
      catalog,
      collected,
    });
    expect(result.replace.service).toBe("masaža");
    expect(result.remove).toEqual(
      expect.arrayContaining(["serviceId", "salonId", "salonName"]),
    );
  });

  it("'ipak ne sutra' briše datum (negirana vrednost, ne zamena)", () => {
    const result = detectDirectCorrection({
      text: "ipak ne sutra",
      catalog,
      collected: { ...collected, date: "2026-06-13" },
    });
    expect(result.remove).toContain("date");
    expect(result.replace.date).toBeUndefined();
  });

  it("'promeni grad' bez nove vrednosti briše grad", () => {
    const result = detectDirectCorrection({
      text: "promeni grad",
      catalog,
      collected,
    });
    expect(result.remove).toContain("city");
  });

  it("'nisam to želeo' bez detalja je vague", () => {
    const result = detectDirectCorrection({
      text: "Nisam to želeo",
      catalog,
      collected,
    });
    expect(result.isCorrection).toBe(true);
    expect(result.vague).toBe(true);
  });

  it("'otkaži termin' NIJE korekcija (operacija nad postojećim terminom)", () => {
    const result = detectDirectCorrection({
      text: "otkaži termin",
      catalog,
      collected,
    });
    expect(result.isCorrection).toBe(false);
  });
});

describe("4.2/4.3 — askAgent correction obrada", () => {
  it("vague korekcija vraća rezime i pitanje, bez blokova", async () => {
    const stream = await askAgent(
      "Nisam to želeo",
      false,
      [],
      "Gost",
      false,
      { service: "feniranje", city: "Beograd" },
      undefined,
    );
    const data = JSON.parse(await readStream(stream));
    expect(data.messages[0].content).toContain("Šta od toga menjamo");
    expect(data.messages[0].content).toContain("feniranje");
    expect(data.messages[0].content).toContain("Beograd");
    expect(data.layout).toEqual([]);
  });

  it("zamena grada: ponovni intent PONIŠTAVA stari (cleared salon + novi grad)", async () => {
    const stream = await askAgent(
      "Ne u Beogradu nego u Novom Sadu",
      false,
      [],
      "Gost",
      false,
      {
        service: "feniranje",
        city: "Beograd",
        salonId: "salon-bg",
        salonName: "Kiki Kiss Beauty",
      },
      undefined,
    );
    const raw = await readStream(stream);
    const data = JSON.parse(raw);
    // Novi grad je preuzeo intent; klijent dobija nalog da obriše stari salon.
    expect(data.intent.city).toBe("Novi Sad");
    expect(data.intent.corrected).toBe(true);
    expect(extractClearedFields(raw)).toEqual(
      expect.arrayContaining(["salonId", "salonName"]),
    );
    // Stari salon se ne vraća u intent-u.
    expect(data.intent.salonId).not.toBe("salon-bg");
  });

  it("poništavanje datuma: potvrda + pitanje za dan + cleared signal", async () => {
    const stream = await askAgent(
      "ipak ne sutra",
      false,
      [],
      "Gost",
      false,
      { service: "feniranje", city: "Beograd", date: "2026-06-13" },
      undefined,
    );
    const raw = await readStream(stream);
    const data = JSON.parse(raw);
    expect(data.messages[0].content).toContain("poništila sam datum");
    expect(extractClearedFields(raw)).toContain("date");
    // Nepromenjena polja ostaju u intent-u — ne pitamo ponovo za njih.
    expect(data.intent.city).toBe("Beograd");
    expect(data.intent.service).toBe("feniranje");
  });
});

describe("4.4 — povratak Mariji ne briše flow usred bookinga", () => {
  it("collected preživi povratak Mariji dok booking nije završen", () => {
    bookingFlow.get().collect({ service: "feniranje", city: "Beograd" });
    bookingFlow.get().setState("collecting_time");
    handleAgentTransition("maria");
    expect(bookingFlow.get().collected.service).toBe("feniranje");
    expect(bookingFlow.get().collected.city).toBe("Beograd");
  });

  it("posle završenog bookinga (completed) flow se resetuje", () => {
    bookingFlow.get().collect({ service: "feniranje", city: "Beograd" });
    bookingFlow.get().setState("completed");
    handleAgentTransition("maria");
    expect(bookingFlow.get().collected).toEqual({});
    expect(bookingFlow.get().state).toBe("idle");
  });
});

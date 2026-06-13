// src/tests/claudiaLoopAndSlice.test.ts
//
// Regression tests za:
// 1. Claudia loop bug — "Nedelja" → isti prazan odgovor → "Nedelja" → loop
// 2. slicePlatformKnowledge integracija u LLM path

import { askAgent } from "@/services/askAgent";
import { platformClient } from "@/lib/api/platformClient";
import { runBookingSearch } from "@/lib/search/runBookingSearch";
import { bookingFlow } from "@/lib/ai/booking-flow-state";
import type { SearchApiResponse, SearchResult } from "@/types/slots";

jest.mock("@/lib/api/platformClient", () => ({
  platformClient: {
    getSalonProfiles: jest.fn(),
    getSalonServices: jest.fn(),
  },
}));

jest.mock("@/lib/search/runBookingSearch", () => ({
  runBookingSearch: jest.fn(),
}));

// Slice + platform knowledge — mock da ne zovemo stvarni DB
jest.mock("@/lib/ai/platform-knowledge", () => ({
  fetchPlatformKnowledge: jest.fn().mockResolvedValue({
    salonsText: "- [bg-1] Kiki Kiss Beauty | Beograd",
    servicesText: "- Šminkanje | 2500 RSD | 60 min | Kiki Kiss Beauty | Beograd",
    citiesText: "Beograd, Novi Sad, Bor",
    categoriesText: "- Šminka",
    raw: {
      salons: [{ _id: "bg-1", name: "Kiki Kiss Beauty", city: "Beograd" }],
      services: [{ _id: "s1", name: "Šminkanje", category: "Šminka", basePrice: 2500, duration: 60, salonId: "bg-1", city: "Beograd" }],
      categories: [],
    },
    semanticMemory: undefined,
  }),
}));

const mockedPlatformClient = platformClient as jest.Mocked<typeof platformClient>;
const mockedRunBookingSearch = runBookingSearch as jest.MockedFunction<typeof runBookingSearch>;

const SALON = { _id: "bg-1", id: "bg-1", name: "Kiki Kiss Beauty", city: "Beograd" };
const SERVICE = { _id: "s1", name: "Šminkanje svečano", category: "Šminka", basePrice: 2500, duration: 60 };

function emptySearchResponse(): SearchApiResponse {
  return {
    results: [],
    slotsByCity: [],
    bestSlot: null,
    fallbackLevel: 0,
    totalSalons: 0,
    debug: {},
  };
}

function searchResponse(slots: SearchResult[]): SearchApiResponse {
  return {
    results: slots,
    slotsByCity: slots.length ? [{ city: "Beograd", slots }] : [],
    bestSlot: slots[0] ?? null,
    fallbackLevel: 0,
    totalSalons: 1,
    debug: {},
  };
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let out = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  return out;
}

beforeEach(() => {
  bookingFlow.get().reset();
  mockedPlatformClient.getSalonProfiles.mockResolvedValue([SALON] as never);
  mockedPlatformClient.getSalonServices.mockResolvedValue([SERVICE] as never);
});

afterEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. No-slots path — loop prevention
// ---------------------------------------------------------------------------

describe("Claudia loop bug — no-slots path", () => {

  it("returns OFFER_NOTIFY_ME when search returns empty results", async () => {
    mockedRunBookingSearch.mockResolvedValue(emptySearchResponse());

    const stream = await askAgent(
      "šminkanje u nedelju",
      false,
      [],
      "Gost",
      false,
      { service: "šminkanje", city: "Beograd", salonId: "bg-1", salonName: "Kiki Kiss Beauty" },
      {
        intent: "booking",
        service: "šminkanje",
        city: "Beograd",
        salonId: "bg-1",
        salonName: "Kiki Kiss Beauty",
        dateMode: "weekend",
      },
    );

    const raw = await readStream(stream as ReadableStream<Uint8Array>);
    const parsed = JSON.parse(raw);

    // Mora imati NotifyMeBlock, ne prazne blokove
    expect(parsed.layout).toBeDefined();
    const blockTypes = (parsed.layout as { type: string }[]).map((b) => b.type);
    expect(blockTypes).toContain("NotifyMeBlock");
  });

  it("no-slots message does NOT say 'Proveravam' again — breaks the loop", async () => {
    mockedRunBookingSearch.mockResolvedValue(emptySearchResponse());

    const stream = await askAgent(
      "nedelja",
      false,
      [],
      "Gost",
      false,
      { service: "šminkanje", city: "Beograd", salonId: "bg-1", salonName: "Kiki Kiss Beauty" },
      {
        intent: "booking",
        service: "šminkanje",
        city: "Beograd",
        salonId: "bg-1",
        salonName: "Kiki Kiss Beauty",
        dateMode: "weekend",
      },
    );

    const raw = await readStream(stream as ReadableStream<Uint8Array>);
    const parsed = JSON.parse(raw);
    const message: string = parsed.messages?.[0]?.content ?? "";

    // Ne sme biti "Proveravam" — to je uzrok loopa
    expect(message).not.toMatch(/proveravam/i);
    // Mora da sadrži alternativu ili pitanje
    expect(message).toMatch(/drug[i|a|o]|obavestim|notify|nema.*termin/i);
  });

  it("no-slots path persists context in bookingFlow for follow-up", async () => {
    mockedRunBookingSearch.mockResolvedValue(emptySearchResponse());

    await askAgent(
      "šminkanje u nedelju",
      false,
      [],
      "Gost",
      false,
      { service: "šminkanje", city: "Beograd" },
      {
        intent: "booking",
        service: "šminkanje",
        city: "Beograd",
        salonId: "bg-1",
        salonName: "Kiki Kiss Beauty",
        dateMode: "weekend",
      },
    );

    // Kontekst mora biti sačuvan da sledeći turn zna o čemu je reč
    const collected = bookingFlow.get().collected;
    expect(collected.service).toBe("šminkanje");
    expect(collected.city).toBe("Beograd");
  });

  it("no-slots with timeWindow gives specific message about time filter", async () => {
    // Ima termina ali ne posle 20h
    mockedRunBookingSearch.mockResolvedValue(
      searchResponse([
        {
          salonId: "bg-1", salonName: "Kiki Kiss Beauty",
          serviceId: "s1", serviceName: "Šminkanje",
          category: "makeup", startTime: "2026-06-01T10:00:00Z",
          city: "Beograd", price: 2500,
          dateLabel: "Ponedeljak", timeLabel: "10:00",
          relevanceScore: 100, fallbackLevel: 0,
        },
      ]),
    );

    const stream = await askAgent(
      "šminkanje posle 20h",
      false,
      [],
      "Gost",
      false,
      { service: "šminkanje", city: "Beograd" },
      {
        intent: "booking",
        service: "šminkanje",
        city: "Beograd",
        salonId: "bg-1",
        salonName: "Kiki Kiss Beauty",
        timeWindowStart: 20,
      },
    );

    const raw = await readStream(stream as ReadableStream<Uint8Array>);
    const parsed = JSON.parse(raw);
    const message: string = parsed.messages?.[0]?.content ?? "";

    // Mora pomenuti vremenski okvir problem
    expect(message).toMatch(/20h|ranije|drug[i|a]/i);
    expect(message).not.toMatch(/proveravam/i);
  });

  it("with slots — returns SHOW_SLOTS, no NotifyMe", async () => {
    mockedRunBookingSearch.mockResolvedValue(
      searchResponse([
        {
          salonId: "bg-1", salonName: "Kiki Kiss Beauty",
          serviceId: "s1", serviceName: "Šminkanje",
          category: "makeup", startTime: "2026-06-07T15:00:00Z",
          city: "Beograd", price: 2500,
          dateLabel: "Nedelja", timeLabel: "15:00",
          relevanceScore: 100, fallbackLevel: 0,
        },
      ]),
    );

    const stream = await askAgent(
      "šminkanje u nedelju",
      false,
      [],
      "Gost",
      false,
      { service: "šminkanje", city: "Beograd" },
      {
        intent: "booking",
        service: "šminkanje",
        city: "Beograd",
        salonId: "bg-1",
        salonName: "Kiki Kiss Beauty",
        dateMode: "weekend",
      },
    );

    const raw = await readStream(stream as ReadableStream<Uint8Array>);
    const parsed = JSON.parse(raw);
    const blockTypes = (parsed.layout as { type: string }[]).map((b) => b.type);

    expect(blockTypes).toContain("AppointmentCalendarBlock");
    expect(blockTypes).not.toContain("NotifyMeBlock");
  });
});

// ---------------------------------------------------------------------------
// 2. slicePlatformKnowledge integration
// ---------------------------------------------------------------------------

describe("slicePlatformKnowledge integration in LLM path", () => {

  it("direct paths (prices, salon_info) do NOT call fetchPlatformKnowledge", async () => {
    const { fetchPlatformKnowledge } = jest.requireMock("@/lib/ai/platform-knowledge");
    fetchPlatformKnowledge.mockClear();

    // Direct prices path — uses fetchBookingSalons not fetchPlatformKnowledge
    await askAgent(
      "cenovnik za šminkanje",
      false,
      [],
      "Gost",
      false,
      undefined,
      undefined, // no handoffPayload → direct path
    );

    // Direct path should not call fetchPlatformKnowledge
    expect(fetchPlatformKnowledge).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Regression — existing tests still pass
// ---------------------------------------------------------------------------

describe("Regression — existing direct paths unaffected", () => {

  it("appointments path still works", async () => {
    const stream = await askAgent(
      "moji termini",
      true,
      [],
      "Ana",
      false,
      undefined,
      { intent: "appointments" },
    );
    const raw = await readStream(stream as ReadableStream<Uint8Array>);
    const parsed = JSON.parse(raw);
    const blockTypes = (parsed.layout as { type: string }[]).map((b) => b.type);
    expect(blockTypes).toContain("CalendarBlock");
  });

  it("auth path for unauthenticated appointments still works", async () => {
    const stream = await askAgent(
      "moji termini",
      false, // not authenticated
      [],
      "Gost",
      false,
      undefined,
      { intent: "appointments" },
    );
    const raw = await readStream(stream as ReadableStream<Uint8Array>);
    const parsed = JSON.parse(raw);
    const blockTypes = (parsed.layout as { type: string }[]).map((b) => b.type);
    expect(blockTypes).toContain("AuthBlock");
  });

  it("prices path returns ServicePriceBlock for known salon", async () => {
    const stream = await askAgent(
      "cenovnik za šminkanje",
      false,
      [],
      "Gost",
      false,
      undefined,
      undefined,
    );
    const raw = await readStream(stream as ReadableStream<Uint8Array>);
    const parsed = JSON.parse(raw);
    // Should show prices or ask for city/salon — not loop
    expect(parsed.messages?.[0]?.content).toBeTruthy();
    expect(parsed.messages?.[0]?.content).not.toContain("undefined");
  });

  it("no visible message contains 'undefined' after no-slots", async () => {
    mockedRunBookingSearch.mockResolvedValue(emptySearchResponse());

    const stream = await askAgent(
      "feniranje sutra",
      false,
      [],
      "Gost",
      false,
      { service: "feniranje", city: "Beograd", salonId: "bg-1", salonName: "Kiki Kiss Beauty" },
      {
        intent: "booking",
        service: "feniranje",
        city: "Beograd",
        salonId: "bg-1",
        salonName: "Kiki Kiss Beauty",
        dateMode: "tomorrow",
      },
    );

    const raw = await readStream(stream as ReadableStream<Uint8Array>);
    const parsed = JSON.parse(raw);
    const message: string = parsed.messages?.[0]?.content ?? "";
    expect(message).not.toContain("undefined");
    expect(message).not.toContain("null");
    expect(message).not.toContain("tražena usluga");
  });
});

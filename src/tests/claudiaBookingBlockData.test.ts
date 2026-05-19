import { platformClient, type PlatformSalon } from "@/lib/api/platformClient";
import { bookingFlow } from "@/lib/ai/booking-flow-state";
import {
  matchingCityItems,
  matchingSalonItems,
} from "@/lib/ai/booking/booking-block-data";
import { askAgent } from "@/services/askAgent";

jest.mock("@/lib/api/platformClient", () => ({
  platformClient: {
    getSalonProfiles: jest.fn(),
  },
}));

const mockedPlatformClient = platformClient as jest.Mocked<typeof platformClient>;

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let full = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) return full;
    full += decoder.decode(value, { stream: true });
  }
}

function salon(params: {
  id: string;
  name: string;
  city: string;
  serviceName: string;
  category: string;
}): PlatformSalon {
  return {
    id: params.id,
    _id: params.id,
    name: params.name,
    city: params.city,
    services: [
      {
        id: `${params.id}-svc`,
        _id: `${params.id}-svc`,
        name: params.serviceName,
        category: params.category,
      },
    ],
  };
}

const salons = [
  salon({
    id: "beauty-m-glow",
    name: "Beauty M Glow",
    city: "Bor",
    serviceName: "Maderoterapija",
    category: "Masaža",
  }),
  salon({
    id: "shi-sham",
    name: "Shi Sham",
    city: "Novi Sad",
    serviceName: "Feniranje",
    category: "Kosa",
  }),
];

describe("Claudia booking city/salon block data", () => {
  beforeEach(() => {
    mockedPlatformClient.getSalonProfiles.mockResolvedValue(salons);
    jest.spyOn(console, "debug").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    bookingFlow.get().reset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("service known + city missing renders CityListBlock", async () => {
    const stream = await askAgent(
      "Mogu li da zakažem termin maderoterapija za danas posle 12?",
      false,
      [],
      "Gost",
      false,
      undefined,
      {
        intent: "booking",
        service: "maderoterapija",
        date: "2026-05-19",
        timeWindowStart: 12,
      },
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.layout[0]).toMatchObject({
      type: "CityListBlock",
      metadata: {
        service: "maderoterapija",
        category: "Masaža",
        cities: [{ name: "Bor", salonCount: 1 }],
      },
    });
  });

  it("service known + city known renders SalonListBlock", async () => {
    const stream = await askAgent(
      "Bor",
      false,
      [],
      "Gost",
      false,
      { service: "maderoterapija", date: "2026-05-19", timeWindowStart: 12 },
      {
        intent: "select_city",
        city: "Bor",
      },
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.messages[0].content).toBe("Dostupni saloni u Boru za maderoterapija.");
    expect(data.layout[0]).toMatchObject({
      type: "SalonListBlock",
      metadata: {
        city: "Bor",
        service: "maderoterapija",
        category: "Masaža",
      },
    });
  });

  it("maderoterapija + Bor returns Beauty M Glow, not Shi Sham", () => {
    const matches = matchingSalonItems(salons, {
      city: "Bor",
      service: "maderoterapija",
    });

    expect(matches).toEqual([{ id: "beauty-m-glow", name: "Beauty M Glow" }]);
    expect(matches.map((match) => match.name)).not.toContain("Shi Sham");
  });

  it("bookingFlow preserves service/date/timeWindowStart after user replies city", () => {
    bookingFlow.get().collect({
      service: "maderoterapija",
      date: "2026-05-19",
      timeWindowStart: 12,
    });
    bookingFlow.get().collect({ city: "Bor" });

    expect(bookingFlow.get().collected).toMatchObject({
      service: "maderoterapija",
      date: "2026-05-19",
      timeWindowStart: 12,
      city: "Bor",
    });
  });

  it("CityListBlock receives cities with Bor for maderoterapija", () => {
    expect(matchingCityItems(salons, { service: "maderoterapija" })).toEqual([
      { name: "Bor", salonCount: 1 },
    ]);
  });

  it("SalonListBlock receives salons filtered by city + service", async () => {
    const stream = await askAgent(
      "Bor",
      false,
      [],
      "Gost",
      false,
      { service: "maderoterapija" },
      { intent: "select_city", city: "Bor" },
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.layout[0].metadata.salons).toEqual([
      { id: "beauty-m-glow", name: "Beauty M Glow" },
    ]);
  });

  it("does not produce an empty city list when a matching city exists", async () => {
    const stream = await askAgent(
      "Maderoterapija danas posle 12",
      false,
      [],
      "Gost",
      false,
      undefined,
      { intent: "booking", service: "maderoterapija", timeWindowStart: 12 },
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.layout[0].metadata.cities).toContainEqual({ name: "Bor", salonCount: 1 });
    expect(data.messages[0].content).not.toContain("Nema dostupnih gradova");
  });

  it("Kosa salon is not returned for maderoterapija", () => {
    const matches = matchingSalonItems(salons, {
      service: "maderoterapija",
    });

    expect(matches.map((match) => match.name)).not.toContain("Shi Sham");
  });
});

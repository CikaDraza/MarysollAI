import { askAgent } from "@/services/askAgent";
import { platformClient } from "@/lib/api/platformClient";
import { runBookingSearch } from "@/lib/search/runBookingSearch";
import type { SearchApiResponse, SearchResult } from "@/types/slots";

jest.mock("@/lib/api/platformClient", () => ({
  platformClient: {
    getSalonProfiles: jest.fn(),
  },
}));

jest.mock("@/lib/search/runBookingSearch", () => ({
  runBookingSearch: jest.fn(),
}));

const mockedPlatformClient = platformClient as jest.Mocked<typeof platformClient>;
const mockedRunBookingSearch = runBookingSearch as jest.MockedFunction<typeof runBookingSearch>;

const selectedSlot: SearchResult = {
  salonId: "salon-1",
  salonName: "Shi Sham Frizerski Salon",
  serviceId: "service-1",
  serviceName: "Feniranje BLOWOUT/WAVES",
  category: "hair",
  startTime: "2026-05-14T14:45:00.000Z",
  city: "Novi Sad",
  price: 1500,
  dateLabel: "Danas",
  timeLabel: "14:45",
  relevanceScore: 100,
  fallbackLevel: 1,
};

function searchResponse(results: SearchResult[]): SearchApiResponse {
  return {
    results,
    slotsByCity: [{ city: "Novi Sad", slots: results }],
    bestSlot: results[0] ?? null,
    fallbackLevel: 0,
    totalSalons: 1,
    debug: {},
  };
}

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

describe("Claudia response boundary", () => {
  beforeEach(() => {
    mockedRunBookingSearch.mockReset();
    mockedPlatformClient.getSalonProfiles.mockResolvedValue([
      {
        id: "salon-1",
        _id: "salon-1",
        name: "Shi Sham Frizerski Salon",
        city: "Novi Sad",
        services: [
          {
            id: "service-1",
            _id: "service-1",
            name: "Feniranje BLOWOUT/WAVES",
            category: "Kosa",
          },
        ],
      },
    ]);
    jest.spyOn(console, "debug").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("appointments authenticated contract adapts to CalendarBlock legacy", async () => {
    const stream = await askAgent("Moji termini", true, [], "Milica", false, undefined, {
      intent: "appointments",
    });
    const data = JSON.parse(await readStream(stream));

    expect(data.messages[0]).toMatchObject({
      content: "Pozdrav, izvolite vaše termine.",
      attachToBlockType: "CalendarBlock",
    });
    expect(data.layout[0]).toMatchObject({
      type: "CalendarBlock",
      metadata: { mode: "list", appointmentListMode: "all" },
    });
    expect(data.intent).toEqual({ type: "appointments" });
  });

  it("appointments guest contract adapts to AuthBlock legacy", async () => {
    const stream = await askAgent("Moji termini", false, [], "Gost", false, undefined, {
      intent: "appointments",
    });
    const data = JSON.parse(await readStream(stream));

    expect(data.messages[0]).toMatchObject({
      content: "Prijavi se da vidiš svoje termine.",
      attachToBlockType: "AuthBlock",
    });
    expect(data.layout[0]).toMatchObject({
      type: "AuthBlock",
      metadata: { mode: "login", intent: "appointments" },
    });
    expect(data.intent).toEqual({ type: "appointments" });
  });

  it("booking branch with city/service adapts to SalonListBlock legacy", async () => {
    mockedRunBookingSearch.mockResolvedValueOnce(searchResponse([selectedSlot]));

    const stream = await askAgent(
      "Feniranje u Novom Sadu posle 14h",
      false,
      [],
      "Gost",
      false,
      undefined,
      {
        intent: "booking",
        service: "feniranje",
        city: "Novi Sad",
        timeWindowStart: 14,
        timeWindowEnd: null,
      },
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.messages[0].attachToBlockType).toBe("SalonListBlock");
    expect(data.layout[0]).toMatchObject({
      type: "SalonListBlock",
      metadata: {
        service: "feniranje",
        city: "Novi Sad",
        salons: [{ id: "salon-1", name: "Shi Sham Frizerski Salon" }],
      },
    });
    expect(data.intent).toMatchObject({
      type: "booking",
      service: "feniranje",
      city: "Novi Sad",
      timeWindowStart: 14,
    });
  });

  it("booking city/service without salon still asks user to choose salon", async () => {
    mockedRunBookingSearch.mockResolvedValueOnce(searchResponse([]));

    const stream = await askAgent(
      "Feniranje u Novom Sadu posle 14h",
      false,
      [],
      "Gost",
      false,
      undefined,
      {
        intent: "booking",
        service: "feniranje",
        city: "Novi Sad",
        timeWindowStart: 14,
      },
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.layout[0]).toMatchObject({
      type: "SalonListBlock",
      metadata: {
        service: "feniranje",
        city: "Novi Sad",
      },
    });
    expect(data.intent).toMatchObject({ type: "booking", service: "feniranje" });
  });

  it("recover_missing_salon contract adapts to SalonListBlock", async () => {
    const stream = await askAgent(
      "Izaberi salon",
      false,
      [],
      "Gost",
      false,
      undefined,
      {
        intent: "recover_missing_salon",
        city: "Novi Sad",
        service: "feniranje",
        salons: [{ id: "salon-1", name: "Shi Sham" }],
      },
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.messages[0].attachToBlockType).toBe("SalonListBlock");
    expect(data.layout[0]).toMatchObject({
      type: "SalonListBlock",
      metadata: {
        city: "Novi Sad",
        service: "feniranje",
        salons: [{ id: "salon-1", name: "Shi Sham" }],
      },
    });
    expect(data.intent).toMatchObject({
      type: "recover_missing_salon",
      city: "Novi Sad",
      service: "feniranje",
    });
  });

  it("login_for_booking contract adapts to AuthBlock", async () => {
    const stream = await askAgent(
      "Prijavi me",
      false,
      [],
      "Gost",
      false,
      undefined,
      { intent: "login_for_booking", selectedSlot },
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.messages[0]).toMatchObject({
      content: "Prijavi se da nastavimo sa zakazivanjem.",
      attachToBlockType: "AuthBlock",
    });
    expect(data.layout[0]).toMatchObject({
      type: "AuthBlock",
      metadata: { mode: "login", selectedSlot: { serviceName: selectedSlot.serviceName } },
    });
    expect(data.intent).toEqual({ type: "login_for_booking" });
  });

  it("resume_booking_after_login contract adapts to AppointmentCalendarBlock when selectedSlot exists", async () => {
    const stream = await askAgent(
      "Uspešna prijava",
      true,
      [],
      "Milica",
      false,
      undefined,
      { intent: "resume_booking_after_login", selectedSlot },
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.messages[0].attachToBlockType).toBe("AppointmentCalendarBlock");
    expect(data.layout[0]).toMatchObject({
      type: "AppointmentCalendarBlock",
      metadata: {
        serviceName: selectedSlot.serviceName,
        city: selectedSlot.city,
        time: selectedSlot.timeLabel,
        clientName: "Milica",
      },
    });
    expect(data.intent).toEqual({ type: "resume_booking_after_login" });
  });

  it("booking_conflict contract adapts to AppointmentCalendarBlock alternatives", async () => {
    const laterSameSalon = {
      ...selectedSlot,
      startTime: "2026-05-14T16:30:00.000Z",
      timeLabel: "16:30",
    };
    const otherSalon = {
      ...selectedSlot,
      salonId: "salon-2",
      salonName: "Drugi salon",
      startTime: "2026-05-14T17:00:00.000Z",
      timeLabel: "17:00",
    };
    mockedRunBookingSearch
      .mockResolvedValueOnce(searchResponse([laterSameSalon, otherSalon]))
      .mockResolvedValueOnce(searchResponse([]));

    const stream = await askAgent(
      "Termin je zauzet",
      true,
      [],
      "Milica",
      false,
      undefined,
      {
        intent: "booking_conflict",
        selectedSlot,
        serviceName: selectedSlot.serviceName,
        salonName: selectedSlot.salonName,
        city: selectedSlot.city,
        date: "2026-05-14",
        time: selectedSlot.timeLabel,
      },
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.messages[0]).toMatchObject({
      attachToBlockType: "AppointmentCalendarBlock",
    });
    expect(data.layout[0]).toMatchObject({
      type: "AppointmentCalendarBlock",
      metadata: {
        city: selectedSlot.city,
        salonId: selectedSlot.salonId,
        timeWindowStart: 15,
        slots: [
          { timeLabel: "16:30", salonId: selectedSlot.salonId },
          { timeLabel: "17:00", salonId: "salon-2" },
        ],
      },
    });
    expect(data.intent).toMatchObject({
      type: "booking_conflict",
      service: selectedSlot.serviceName,
      city: selectedSlot.city,
    });
  });
});

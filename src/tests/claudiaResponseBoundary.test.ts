import { askAgent, filterSearchResultByStartHour } from "@/services/askAgent";
import { platformClient } from "@/lib/api/platformClient";
import { runBookingSearch } from "@/lib/search/runBookingSearch";
import { bookingFlow } from "@/lib/ai/booking-flow-state";
import { sendSystemAction } from "@/lib/ai/events/systemActionDispatcher";
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
    bookingFlow.get().reset();
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
    bookingFlow.get().reset();
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

  it("direct Ruma salon info is handled by Claudia without Maria", async () => {
    mockedPlatformClient.getSalonProfiles.mockResolvedValueOnce([
      { id: "bg-1", _id: "bg-1", name: "Kiki Kiss Beauty", city: "Beograd", services: [] },
      { id: "ns-1", _id: "ns-1", name: "Shi Sham", city: "Novi Sad", services: [] },
    ]);

    const stream = await askAgent("Da li imate salon u Rumi?", false, [], "Gost");
    const data = JSON.parse(await readStream(stream));

    expect(data.messages[0].content).toContain("Trenutno nemamo salon u Rumi");
    expect(data.messages[0].content).toContain("Najbliže opcije");
    expect(data.layout).toEqual([]);
  });

  it("direct price query for service asks for city or salon when missing", async () => {
    const stream = await askAgent("Mogu li cenovnik za feniranje?", false, [], "Gost");
    const data = JSON.parse(await readStream(stream));

    expect(data.messages[0].content).toBe("Za koji grad ili salon?");
    expect(data.layout).toEqual([]);
    expect(JSON.stringify(data)).not.toContain("tražena usluga");
  });

  it("price follow-up Beograd sminkanje returns focused price block", async () => {
    mockedPlatformClient.getSalonProfiles.mockResolvedValueOnce([
      {
        id: "kiki",
        _id: "kiki",
        name: "Kiki Kiss Beauty",
        city: "Beograd",
        services: [{ id: "makeup-1", _id: "makeup-1", name: "Šminkanje dnevno", category: "Šminka" }],
      },
    ]);

    const stream = await askAgent(
      "Beograd, šminkanje",
      false,
      [{ id: "m1", type: "message", data: { id: "msg-1", role: "assistant", content: "Za koju uslugu ili salon?", timestamp: Date.now() } }],
      "Gost",
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.messages[0].content).toContain("šminkanje");
    expect(data.layout[0].type).toBe("ServicePriceBlock");
    expect(data.layout[0].metadata.service).toBe("šminkanje");
  });

  it("direct makeup variants question uses price context", async () => {
    mockedPlatformClient.getSalonProfiles.mockResolvedValueOnce([
      {
        id: "kiki",
        _id: "kiki",
        name: "Kiki Kiss Beauty",
        city: "Beograd",
        services: [{ id: "makeup-1", _id: "makeup-1", name: "Šminkanje dnevno", category: "Šminka" }],
      },
    ]);

    const stream = await askAgent(
      "Koje vrste šminkanja ima?",
      false,
      [],
      "Gost",
      false,
      { city: "Beograd", service: "šminkanje" },
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.layout[0].type).toBe("ServicePriceBlock");
    expect(data.intent.service).toBe("šminkanje");
  });

  it("direct booking parses Kiki Kiss sminkanje nedelja without Maria payload", async () => {
    mockedPlatformClient.getSalonProfiles.mockResolvedValueOnce([
      {
        id: "kiki",
        _id: "kiki",
        name: "Kiki Kiss Beauty",
        city: "Beograd",
        services: [{ id: "makeup-1", _id: "makeup-1", name: "Šminkanje dnevno", category: "Šminka" }],
      },
    ]);
    mockedRunBookingSearch.mockResolvedValueOnce(searchResponse([
      { ...selectedSlot, salonId: "kiki", salonName: "Kiki Kiss Beauty", serviceName: "Šminkanje dnevno", city: "Beograd" },
    ]));

    const stream = await askAgent("Želim Kiki Kiss šminkanje u nedelju", false, [], "Gost");
    const data = JSON.parse(await readStream(stream));

    expect(mockedRunBookingSearch).toHaveBeenCalled();
    expect(data.intent).toMatchObject({ type: "booking", salonName: "Kiki Kiss Beauty" });
    expect(JSON.stringify(data)).not.toContain("tražena usluga");
  });

  it("direct date follow-up uses existing booking context", async () => {
    mockedRunBookingSearch.mockResolvedValueOnce(searchResponse([selectedSlot]));

    const stream = await askAgent(
      "Nedelja",
      false,
      [],
      "Gost",
      false,
      { city: "Novi Sad", service: "feniranje", salonName: "Shi Sham Frizerski Salon" },
    );
    const data = JSON.parse(await readStream(stream));

    expect(mockedRunBookingSearch).toHaveBeenCalled();
    expect(data.intent).toMatchObject({ type: "booking", service: "feniranje" });
  });

  it("direct Moji termini goes appointments", async () => {
    const stream = await askAgent("Moji termini", false, [], "Gost");
    const data = JSON.parse(await readStream(stream));

    expect(data.layout[0].type).toBe("AuthBlock");
    expect(data.intent.type).toBe("appointments");
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

  it("Claudia select_salon visible message does not include salonId", async () => {
    const stream = await askAgent(
      "system_action:SALON_SELECTED",
      false,
      [],
      "Gost",
      false,
      undefined,
      {
        intent: "select_salon",
        city: "Novi Sad",
        service: "feniranje",
        salonId: "salon-secret-id",
        salonName: "Shi Sham Frizerski Salon",
      },
    );

    const data = JSON.parse(await readStream(stream));

    expect(data.messages[0].content).toContain("Shi Sham Frizerski Salon");
    expect(data.messages[0].content).not.toContain("salon-secret-id");
    expect(data.layout[0].type).toBe("AppointmentCalendarBlock");
  });

  it("Claudia service selected visible message does not include serviceId", async () => {
    const stream = await askAgent(
      "system_action:SERVICE_SELECTED_FOR_SALON",
      false,
      [],
      "Gost",
      false,
      undefined,
      {
        intent: "select_salon",
        city: "Novi Sad",
        service: "feniranje",
        serviceId: "service-secret-id",
        serviceName: "Feniranje BLOWOUT/WAVES",
        salonId: "salon-secret-id",
        salonName: "Shi Sham Frizerski Salon",
        displayMessage:
          "Izabrana je usluga Feniranje BLOWOUT/WAVES u salonu Shi Sham Frizerski Salon.",
      },
    );

    const data = JSON.parse(await readStream(stream));

    expect(data.messages[0].content).toContain("Feniranje BLOWOUT/WAVES");
    expect(data.messages[0].content).not.toContain("service-secret-id");
    expect(data.messages[0].content).not.toContain("salon-secret-id");
    expect(data.layout[0].type).toBe("AppointmentCalendarBlock");
  });

  it("one salon + exact service + date/timeWindow goes directly to slots", async () => {
    mockedRunBookingSearch.mockResolvedValueOnce(searchResponse([selectedSlot]));

    const stream = await askAgent(
      "Feniranje u Novom Sadu sutra posle 14h",
      false,
      [],
      "Gost",
      false,
      undefined,
      {
        intent: "booking",
        service: "feniranje",
        city: "Novi Sad",
        date: "2026-05-28",
        timeWindowStart: 14,
      },
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.messages[0].attachToBlockType).toBe("AppointmentCalendarBlock");
    expect(data.layout[0]).toMatchObject({
      type: "AppointmentCalendarBlock",
      metadata: {
        serviceId: "service-1",
        salonId: "salon-1",
        slots: [{ salonName: "Shi Sham Frizerski Salon" }],
      },
    });
  });

  it("search filter treats 'posle 12' as strictly after 12:00", () => {
    const atNoon = { ...selectedSlot, startTime: "2026-05-14T12:00:00.000Z", timeLabel: "12:00" };
    const afterNoon = { ...selectedSlot, startTime: "2026-05-14T12:30:00.000Z", timeLabel: "12:30" };

    const filtered = filterSearchResultByStartHour(
      {
        results: [atNoon, afterNoon],
        slotsByCity: [{ city: "Novi Sad", slots: [atNoon, afterNoon] }],
        bestSlot: atNoon,
        fallbackLevel: 0,
        totalSalons: 1,
        debug: {},
      },
      12,
    );

    expect(filtered.results.map((slot) => slot.timeLabel)).toEqual(["12:30"]);
  });

  it("search filter treats 'od 12' as inclusive of 12:00", () => {
    const atNoon = { ...selectedSlot, startTime: "2026-05-14T12:00:00.000Z", timeLabel: "12:00" };
    const afterNoon = { ...selectedSlot, startTime: "2026-05-14T12:30:00.000Z", timeLabel: "12:30" };

    const filtered = filterSearchResultByStartHour(
      {
        results: [atNoon, afterNoon],
        slotsByCity: [{ city: "Novi Sad", slots: [atNoon, afterNoon] }],
        bestSlot: atNoon,
        fallbackLevel: 0,
        totalSalons: 1,
        debug: {},
      },
      12,
      { inclusive: true },
    );

    expect(filtered.results.map((slot) => slot.timeLabel)).toEqual(["12:00", "12:30"]);
  });

  it("active booking exact time update preserves selected salon/service/city/date and renders confirmation", async () => {
    const exactSlot = {
      ...selectedSlot,
      salonId: "salon-bor",
      salonName: "Beauty M Glow",
      serviceId: "service-madero",
      serviceName: "Maderoterapija",
      city: "Bor",
      startTime: "2026-05-28T15:00:00.000Z",
      timeLabel: "15:00",
    };
    mockedRunBookingSearch.mockResolvedValueOnce(searchResponse([exactSlot]));

    const stream = await askAgent(
      "Hvala, da li može ipak termin u 15:00 ako je slobodan?",
      false,
      [],
      "Gost",
      false,
      {
        service: "maderoterapija",
        serviceId: "service-madero",
        serviceName: "Maderoterapija",
        city: "Bor",
        salonId: "salon-bor",
        salonName: "Beauty M Glow",
        date: "2026-05-28",
        timeWindowStart: 12,
      },
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.layout.map((block: { type: string }) => block.type)).toEqual([
      "AppointmentCalendarBlock",
    ]);
    expect(data.layout[0].metadata).toMatchObject({
      mode: "confirmation_form",
      salonId: "salon-bor",
      salonName: "Beauty M Glow",
      serviceId: "service-madero",
      serviceName: "Maderoterapija",
      city: "Bor",
      date: "2026-05-28",
      time: "15:00",
      timeWindowStart: null,
      timeWindowEnd: null,
    });
    expect(data.layout[0].metadata.slots).toEqual([
      expect.objectContaining({ timeLabel: "15:00" }),
    ]);
    expect(mockedRunBookingSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        salonId: "salon-bor",
        serviceId: "service-madero",
        city: "Bor",
        date: "2026-05-28",
        time: "15:00",
        timeWindowStart: null,
      }),
    );
    expect(console.debug).toHaveBeenCalledWith(
      "[BOOKING_MEMORY_UPDATE]",
      expect.objectContaining({ changedFields: ["time"] }),
    );
    expect(console.debug).toHaveBeenCalledWith(
      "[CLAUDIA_MEMORY_AT_INPUT]",
      expect.objectContaining({
        hasSalon: true,
        isFollowUpTimeCorrection: true,
      }),
    );
  });

  it("SERVICE_SELECTED_FOR_SALON updates bookingFlow with salon service date and time window", () => {
    sendSystemAction({
      action: "SERVICE_SELECTED_FOR_SALON",
      source: "CalendarBlock",
      notifyAgent: true,
      visibleInThread: false,
      payload: {
        city: "Bor",
        salonId: "salon-bor",
        salonName: "Beauty M Glow",
        serviceId: "service-madero",
        serviceName: "Maderoterapija",
        category: "Masaža",
        date: "2026-05-28",
        timeWindowStart: 12,
        timeWindowEnd: null,
      },
    });

    expect(bookingFlow.get().collected).toMatchObject({
      city: "Bor",
      salonId: "salon-bor",
      salonName: "Beauty M Glow",
      serviceId: "service-madero",
      serviceName: "Maderoterapija",
      service: "Maderoterapija",
      category: "Masaža",
      date: "2026-05-28",
      timeWindowStart: 12,
      timeWindowEnd: null,
    });
    expect(console.debug).toHaveBeenCalledWith(
      "[BOOKING_FLOW_COLLECT_SERVICE_SELECTED]",
      expect.objectContaining({
        payloadKeys: expect.arrayContaining(["salonId", "serviceId", "date", "timeWindowStart"]),
        collectedAfter: expect.objectContaining({ salonId: "salon-bor", serviceId: "service-madero" }),
      }),
    );
  });

  it("after SERVICE_SELECTED_FOR_SALON, exact follow-up uses bookingFlow memory", async () => {
    sendSystemAction({
      action: "SERVICE_SELECTED_FOR_SALON",
      source: "CalendarBlock",
      notifyAgent: true,
      visibleInThread: false,
      payload: {
        city: "Bor",
        salonId: "salon-bor",
        salonName: "Beauty M Glow",
        serviceId: "service-madero",
        serviceName: "Maderoterapija",
        date: "2026-05-28",
        timeWindowStart: 12,
        timeWindowEnd: null,
      },
    });
    mockedRunBookingSearch.mockResolvedValueOnce(
      searchResponse([
        {
          ...selectedSlot,
          salonId: "salon-bor",
          salonName: "Beauty M Glow",
          serviceId: "service-madero",
          serviceName: "Maderoterapija",
          city: "Bor",
          startTime: "2026-05-28T15:00:00.000Z",
          timeLabel: "15:00",
        },
      ]),
    );

    const stream = await askAgent(
      "ipak u 15:00",
      false,
      [],
      "Gost",
      false,
      bookingFlow.get().collected,
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.layout.map((block: { type: string }) => block.type)).toEqual([
      "AppointmentCalendarBlock",
    ]);
    expect(data.layout[0].metadata).toMatchObject({
      mode: "confirmation_form",
      salonId: "salon-bor",
      serviceId: "service-madero",
      city: "Bor",
      date: "2026-05-28",
      time: "15:00",
      timeWindowStart: null,
      timeWindowEnd: null,
    });
  });

  it("active booking exact time update does not render CityListBlock or SalonListBlock", async () => {
    mockedRunBookingSearch.mockResolvedValueOnce(searchResponse([
      { ...selectedSlot, startTime: "2026-05-28T15:00:00.000Z", timeLabel: "15:00" },
    ]));

    const stream = await askAgent(
      "ipak u 15:00",
      false,
      [],
      "Gost",
      false,
      {
        service: "feniranje",
        serviceId: "service-1",
        serviceName: "Feniranje BLOWOUT/WAVES",
        city: "Novi Sad",
        salonId: "salon-1",
        salonName: "Shi Sham Frizerski Salon",
        date: "2026-05-28",
        timeWindowStart: 12,
      },
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.layout.map((block: { type: string }) => block.type)).not.toContain("CityListBlock");
    expect(data.layout.map((block: { type: string }) => block.type)).not.toContain("SalonListBlock");
  });

  it("active booking exact time unavailable renders alternatives after requested time", async () => {
    const beforeRequested = {
      ...selectedSlot,
      startTime: "2026-05-28T14:30:00.000Z",
      timeLabel: "14:30",
      serviceDuration: 45,
    };
    const overlapsRequestedDuration = {
      ...selectedSlot,
      startTime: "2026-05-28T15:30:00.000Z",
      timeLabel: "15:30",
      serviceDuration: 45,
    };
    const alternative = {
      ...selectedSlot,
      startTime: "2026-05-28T16:00:00.000Z",
      timeLabel: "16:00",
      serviceDuration: 45,
    };
    mockedRunBookingSearch.mockResolvedValueOnce(
      searchResponse([beforeRequested, overlapsRequestedDuration, alternative]),
    );

    const stream = await askAgent(
      "da li može u 15:00",
      false,
      [],
      "Gost",
      false,
      {
        service: "feniranje",
        serviceId: "service-1",
        serviceName: "Feniranje BLOWOUT/WAVES",
        city: "Novi Sad",
        salonId: "salon-1",
        salonName: "Shi Sham Frizerski Salon",
        date: "2026-05-28",
        timeWindowStart: 12,
      },
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.messages[0].content).toContain("15:00 nije slobodan");
    expect(data.messages[0].content).toContain("posle 15:45");
    expect(data.layout[0]).toMatchObject({
      type: "AppointmentCalendarBlock",
      metadata: {
        mode: "slot_picker",
        slots: [{ timeLabel: "16:00" }],
      },
    });
  });

  it("follow-up correction increments flowVersion and cancels pending selection flow", async () => {
    bookingFlow.get().startPendingSelectionFlow();
    const beforeVersion = bookingFlow.get().flowVersion;
    mockedRunBookingSearch.mockResolvedValueOnce(searchResponse([]));

    await askAgent(
      "ipak u 15:00",
      false,
      [],
      "Gost",
      false,
      {
        service: "feniranje",
        serviceId: "service-1",
        serviceName: "Feniranje BLOWOUT/WAVES",
        city: "Novi Sad",
        salonId: "salon-1",
        salonName: "Shi Sham Frizerski Salon",
        date: "2026-05-28",
        timeWindowStart: 12,
      },
    );

    expect(bookingFlow.get().flowVersion).toBeGreaterThan(beforeVersion);
    expect(bookingFlow.get().pendingSelectionFlowVersion).toBeUndefined();
    expect(bookingFlow.get().collected).toMatchObject({
      time: "15:00",
      timeWindowStart: null,
      timeWindowEnd: null,
    });
  });

  it("stale select_city handoff after booking_time_alternatives renders no SalonListBlock", async () => {
    const staleVersion = bookingFlow.get().flowVersion;
    bookingFlow.get().cancelPendingSelectionFlow();

    const stream = await askAgent(
      "system_action:CITY_SELECTED",
      false,
      [],
      "Gost",
      false,
      { service: "feniranje", city: "Novi Sad", date: "2026-05-28" },
      {
        intent: "select_city",
        city: "Novi Sad",
        service: "feniranje",
        flowVersion: staleVersion,
      },
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.layout.map((block: { type: string }) => block.type)).not.toContain("SalonListBlock");
    expect(console.debug).toHaveBeenCalledWith(
      "[CLAUDIA_STALE_HANDOFF_IGNORED]",
      expect.objectContaining({ intent: "select_city" }),
    );
  });

  it("stale select_salon handoff after booking_time_alternatives renders no AppointmentCalendarBlock", async () => {
    const staleVersion = bookingFlow.get().flowVersion;
    bookingFlow.get().cancelPendingSelectionFlow();

    const stream = await askAgent(
      "system_action:SERVICE_SELECTED_FOR_SALON",
      false,
      [],
      "Gost",
      false,
      {
        service: "feniranje",
        city: "Novi Sad",
        date: "2026-05-28",
        salonId: "salon-1",
        salonName: "Shi Sham Frizerski Salon",
      },
      {
        intent: "select_salon",
        city: "Novi Sad",
        service: "feniranje",
        salonId: "salon-1",
        salonName: "Shi Sham Frizerski Salon",
        flowVersion: staleVersion,
      },
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.layout.map((block: { type: string }) => block.type)).not.toContain("AppointmentCalendarBlock");
    expect(console.debug).toHaveBeenCalledWith(
      "[CLAUDIA_STALE_HANDOFF_IGNORED]",
      expect.objectContaining({ intent: "select_salon" }),
    );
  });

  it("SERVICE_SELECTED_FOR_SALON with old flowVersion is ignored", () => {
    const oldVersion = bookingFlow.get().flowVersion;
    bookingFlow.get().bumpFlowVersion("test_newer_flow");

    const event = sendSystemAction({
      action: "SERVICE_SELECTED_FOR_SALON",
      actionId: "old-service-action",
      source: "CalendarBlock",
      notifyAgent: true,
      visibleInThread: false,
      payload: {
        city: "Bor",
        salonId: "old-salon",
        salonName: "Old Salon",
        serviceId: "old-service",
        serviceName: "Old Service",
        date: "2026-05-28",
        flowVersion: oldVersion,
      },
    });

    expect(event).toBeNull();
    expect(bookingFlow.get().collected.salonId).toBeUndefined();
    expect(console.debug).toHaveBeenCalledWith(
      "[STALE_BOOKING_ACTION_IGNORED]",
      expect.objectContaining({ action: "SERVICE_SELECTED_FOR_SALON" }),
    );
  });

  it("same SystemActionEvent actionId is processed only once", () => {
    const flowVersion = bookingFlow.get().flowVersion;
    const first = sendSystemAction({
      action: "CITY_SELECTED",
      actionId: "duplicate-city-action",
      source: "CalendarBlock",
      notifyAgent: true,
      visibleInThread: false,
      payload: {
        city: "Bor",
        service: "maderoterapija",
        flowVersion,
      },
    });
    const second = sendSystemAction({
      action: "CITY_SELECTED",
      actionId: "duplicate-city-action",
      source: "CalendarBlock",
      notifyAgent: true,
      visibleInThread: false,
      payload: {
        city: "Bor",
        service: "maderoterapija",
        flowVersion,
      },
    });

    expect(first).toBeTruthy();
    expect(second).toBeNull();
    expect(console.debug).toHaveBeenCalledWith(
      "[DUPLICATE_SYSTEM_ACTION_IGNORED]",
      expect.objectContaining({ actionId: "duplicate-city-action" }),
    );
  });

  it("fresh SlotSelected still works after stale guard", () => {
    const event = sendSystemAction({
      action: "SLOT_SELECTED",
      actionId: "fresh-slot-selected",
      source: "BookingWidget",
      payload: { selectedSlot, flowVersion: bookingFlow.get().flowVersion },
      notifyAgent: false,
      visibleInThread: false,
    });

    expect(event).toBeTruthy();
    expect(bookingFlow.get().collected).toMatchObject({
      serviceName: selectedSlot.serviceName,
      salonId: selectedSlot.salonId,
      time: selectedSlot.timeLabel,
    });
  });

  it("exact time without active booking asks for missing context instead of guessing", async () => {
    const stream = await askAgent("u 15:00", false, [], "Gost", false);
    const data = JSON.parse(await readStream(stream));

    expect(mockedRunBookingSearch).not.toHaveBeenCalled();
    expect(data.layout ?? []).toEqual([]);
    expect(data.intent).toMatchObject({ type: "booking" });
    expect(data.messages[0].content).toContain("Koju uslugu");
  });

  it("SERVICE_SELECTED_FOR_SALON handoff leads to AppointmentCalendarBlock metadata", async () => {
    const stream = await askAgent(
      "system_action:SERVICE_SELECTED_FOR_SALON",
      false,
      [],
      "Gost",
      false,
      { service: "feniranje", city: "Novi Sad", date: "2026-05-28", timeWindowStart: 14 },
      {
        intent: "select_salon",
        city: "Novi Sad",
        salonId: "salon-1",
        salonName: "Shi Sham Frizerski Salon",
        serviceId: "service-1",
        serviceName: "Feniranje BLOWOUT/WAVES",
        category: "Kosa",
        date: "2026-05-28",
        timeWindowStart: 14,
        timeWindowEnd: null,
      },
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.layout[0]).toMatchObject({
      type: "AppointmentCalendarBlock",
      metadata: {
        salonId: "salon-1",
        salonName: "Shi Sham Frizerski Salon",
        serviceId: "service-1",
        serviceName: "Feniranje BLOWOUT/WAVES",
        city: "Novi Sad",
        date: "2026-05-28",
        timeWindowStart: 14,
        timeWindowEnd: null,
      },
    });
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

  it("booking_success replaces selection workspace with Moji termini CalendarBlock", async () => {
    bookingFlow.get().startPendingSelectionFlow();
    bookingFlow.get().collect({
      service: "maderoterapija",
      serviceName: "Maderoterapija - Celo telo i ruke",
      city: "Bor",
      salonId: "beauty-m-glow",
      salonName: "Beauty M Glow",
      date: "2026-05-28",
      time: "16:00",
    });

    const stream = await askAgent(
      "system_action:BOOKING_SUBMIT_SUCCESS",
      true,
      [],
      "Milica",
      false,
      bookingFlow.get().collected,
      {
        intent: "booking_success",
        selectedSlot: {
          ...selectedSlot,
          salonId: "beauty-m-glow",
          salonName: "Beauty M Glow",
          serviceName: "Maderoterapija - Celo telo i ruke",
          city: "Bor",
          timeLabel: "16:00",
        },
      },
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.messages[0]).toMatchObject({
      attachToBlockType: "CalendarBlock",
    });
    expect(data.layout.map((block: { type: string }) => block.type)).toEqual([
      "CalendarBlock",
    ]);
    expect(data.layout[0]).toMatchObject({
      type: "CalendarBlock",
      metadata: {
        mode: "list",
        appointmentListMode: "all",
        intent: "booking_success",
      },
    });
    expect(data.layout.map((block: { type: string }) => block.type)).not.toContain("SalonListBlock");
    expect(bookingFlow.get().pendingSelectionFlowVersion).toBeUndefined();
    expect(bookingFlow.get().state).toBe("completed");
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

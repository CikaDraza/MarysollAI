import { detectSlotSelectionIntent } from "@/lib/ai/detectSlotSelectionIntent";
import type { SearchResult } from "@/types/slots";

const baseSlot: SearchResult = {
  salonId: "salon-1",
  salonName: "Shi Sham Frizerski Salon",
  serviceId: "service-1",
  serviceName: "Feniranje BLOWOUT/WAVES",
  category: "hair",
  startTime: "2026-05-14T08:00:00.000Z",
  city: "Novi Sad",
  price: 1500,
  dateLabel: "Sutra",
  timeLabel: "08:00",
  relevanceScore: 100,
  fallbackLevel: 1,
};

const slots: SearchResult[] = [
  baseSlot,
  {
    ...baseSlot,
    serviceId: "service-2",
    serviceName: "Feniranje STRAIGHT",
    price: 1000,
  },
  {
    ...baseSlot,
    serviceId: "service-3",
    serviceName: "Skraćivanje krajeva + feniranje STRAIGHT",
    price: 3500,
  },
];

describe("detectSlotSelectionIntent", () => {
  it("matches natural selection by time, service, and salon", () => {
    const result = detectSlotSelectionIntent({
      userMessage: "Ok, u 8 feniranje blowout u Shi Sham",
      previousSlots: slots,
    });

    expect(result.isSlotSelection).toBe(true);
    expect(result.selectedSlot?.serviceName).toBe("Feniranje BLOWOUT/WAVES");
    expect(result.confidence).toBeGreaterThanOrEqual(0.45);
  });

  it("matches copied slot text before search extraction", () => {
    const result = detectSlotSelectionIntent({
      userMessage: "Sutra u 08:00 - Feniranje BLOWOUT/WAVES, Shi Sham Frizerski Salon",
      previousSlots: slots,
    });

    expect(result.isSlotSelection).toBe(true);
    expect(result.selectedSlot?.serviceName).toBe("Feniranje BLOWOUT/WAVES");
    expect(result.matchReason).toContain("copied_slot_text");
  });

  it("matches explicit option number", () => {
    const result = detectSlotSelectionIntent({
      userMessage: "drugi termin molim",
      previousSlots: slots,
    });

    expect(result.isSlotSelection).toBe(true);
    expect(result.selectedSlot?.serviceName).toBe("Feniranje STRAIGHT");
  });
});

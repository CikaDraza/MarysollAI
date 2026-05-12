import { calculateSlotScore } from "@/lib/search/slotScore";
import { rankSearchResults } from "@/lib/search/rankSearchResults";
import type { SearchResult } from "@/types/slots";

function makeSlot(overrides: Partial<SearchResult>): SearchResult {
  return {
    salonId: "salon",
    salonName: "Salon",
    serviceId: "svc",
    serviceName: "Service",
    category: "Nokti",
    startTime: "2026-05-13T10:00:00.000Z",
    city: "Beograd",
    dateLabel: "Sutra",
    timeLabel: "10:00",
    relevanceScore: 0,
    fallbackLevel: 1,
    ...overrides,
  };
}

describe("ranking trust signals", () => {
  it("availabilityConfidence is the dominant score component", () => {
    const verified = calculateSlotScore({
      startTime: "2026-05-26T20:00:00.000Z",
      distanceKm: 200,
      rating: 1,
      popularity: 0,
      bookingFrequency: 0,
      testimonials: 0,
      availabilityConfidence: "calendar_verified",
    }).score;

    const synthetic = calculateSlotScore({
      startTime: "2026-05-12T10:00:00.000Z",
      distanceKm: 0,
      rating: 5,
      popularity: 1,
      bookingFrequency: 1,
      testimonials: 1,
      availabilityConfidence: "synthetic_projection",
    }).score;

    expect(verified).toBeGreaterThan(synthetic);
  });

  it("rankSearchResults drops exact duplicate salon/start/service candidates", () => {
    const duplicateA = makeSlot({
      salonId: "kiki",
      startTime: "2026-05-13T10:00:00.000Z",
      serviceId: "gel",
      availabilityConfidence: "calendar_verified",
    });
    const duplicateB = makeSlot({
      salonId: "kiki",
      startTime: "2026-05-13T10:00:00.000Z",
      serviceId: "gel",
      availabilityConfidence: "calendar_verified",
    });

    const ranked = rankSearchResults({
      slots: [duplicateA, duplicateB],
      strategy: "quickaccess",
      fallbackLevel: 1,
    });

    expect(ranked.debug.inputCount).toBe(1);
    expect(ranked.slots).toHaveLength(1);
  });

  it("QuickAccess top results prefer different salons when available", () => {
    const ranked = rankSearchResults({
      slots: [
        makeSlot({ salonId: "a", serviceId: "hair", startTime: "2026-05-13T10:00:00.000Z", availabilityConfidence: "calendar_verified" }),
        makeSlot({ salonId: "a", serviceId: "nails", startTime: "2026-05-13T11:00:00.000Z", availabilityConfidence: "calendar_verified" }),
        makeSlot({ salonId: "b", serviceId: "makeup", startTime: "2026-05-13T12:00:00.000Z", availabilityConfidence: "calendar_verified" }),
      ],
      strategy: "quickaccess",
      fallbackLevel: 1,
    });

    expect(ranked.slots.slice(0, 2).map((s) => s.salonId)).toEqual(["a", "b"]);
  });
});

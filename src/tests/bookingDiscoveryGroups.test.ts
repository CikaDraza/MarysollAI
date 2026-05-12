import {
  buildBookingDiscoveryGroups,
  type BookingDiscoveryGroupType,
} from "@/lib/search/buildBookingDiscoveryGroups";
import type { RankedSlot } from "@/lib/search/rankSearchResults";

function slot(overrides: Partial<RankedSlot>): RankedSlot {
  return {
    salonId: "salon",
    salonName: "Salon",
    serviceId: "svc",
    serviceName: "Feniranje",
    category: "hair",
    startTime: "2026-05-13T10:00:00.000Z",
    city: "Novi Sad",
    dateLabel: "Sutra",
    timeLabel: "10:00",
    relevanceScore: 0,
    fallbackLevel: 1,
    availabilityConfidence: "working_hours_only",
    availabilityConfidenceScore: 0.55,
    availabilityType: "working_hours",
    rankingMeta: {
      score: 700,
      fallbackLevel: 1,
      strategy: "bookingwidget",
      diversityApplied: false,
    },
    ...overrides,
  };
}

function types(groups: { type: BookingDiscoveryGroupType }[]): BookingDiscoveryGroupType[] {
  return groups.map((g) => g.type);
}

describe("buildBookingDiscoveryGroups", () => {
  it("builds exact city first and prefers distinct salons before filling", () => {
    const { groups } = buildBookingDiscoveryGroups({
      fallbackLevel: 4,
      query: { city: "Novi Sad", category: "hair" },
      slots: [
        slot({ salonId: "a", startTime: "2026-05-13T10:00:00.000Z" }),
        slot({ salonId: "a", startTime: "2026-05-13T10:30:00.000Z" }),
        slot({ salonId: "b", startTime: "2026-05-13T11:00:00.000Z" }),
      ],
    });

    expect(groups[0].type).toBe("exact_city");
    expect(groups[0].slots.map((s) => s.salonId)).toEqual(["a", "b", "a"]);
  });

  it("fills a row with multiple times from one salon when there are not enough salons", () => {
    const { groups } = buildBookingDiscoveryGroups({
      fallbackLevel: 1,
      query: { city: "Beograd" },
      mode: "search",
      slots: Array.from({ length: 6 }, (_, i) =>
        slot({
          salonId: "kiki",
          salonName: "Kiki Kiss Beauty",
          city: "Beograd",
          startTime: `2026-05-13T${String(10 + i).padStart(2, "0")}:00:00.000Z`,
          timeLabel: `${10 + i}:00`,
        }),
      ),
    });

    expect(groups[0].type).toBe("exact_city");
    expect(groups[0].slots).toHaveLength(5);
    expect(new Set(groups[0].slots.map((s) => s.startTime)).size).toBe(5);
  });

  it("adds nearby city groups when exact city recall is weak", () => {
    const { groups } = buildBookingDiscoveryGroups({
      fallbackLevel: 5,
      query: { city: "Novi Sad", category: "hair" },
      slots: [
        slot({ salonId: "ns", city: "Novi Sad" }),
        slot({ salonId: "bg", city: "Beograd", distanceKm: 70 }),
        slot({ salonId: "sm", city: "Sremska Mitrovica", distanceKm: 45 }),
      ],
    });

    expect(types(groups)).toContain("nearby_cities");
    expect(groups.find((g) => g.type === "nearby_cities")?.slots[0].city).toBe(
      "Sremska Mitrovica",
    );
  });

  it("adds related services when exact category has low recall", () => {
    const { groups } = buildBookingDiscoveryGroups({
      fallbackLevel: 3,
      query: { city: "Novi Sad", category: "hair" },
      slots: [
        slot({ salonId: "nails", category: "nails", serviceName: "Manikir" }),
        slot({ salonId: "makeup", category: "makeup", serviceName: "Šminkanje" }),
      ],
    });

    expect(types(groups)).toContain("related_services");
    expect(groups.find((g) => g.type === "related_services")?.relationReason).toBe(
      "same_city_related_category",
    );
  });

  it("does not include synthetic slots in primary discovery groups", () => {
    const { groups } = buildBookingDiscoveryGroups({
      fallbackLevel: 6,
      query: { city: "Novi Sad" },
      slots: [
        slot({
          salonId: "synthetic",
          availabilityConfidence: "synthetic_projection",
          availabilityConfidenceScore: 0.15,
          availabilityType: "synthetic",
          isSynthetic: true,
        }),
      ],
    });

    expect(groups).toEqual([]);
  });

  it("avoids duplicating quickaccess slots when alternatives exist", () => {
    const quick = slot({
      salonId: "quick",
      serviceName: "Manikir",
      startTime: "2026-05-13T10:00:00.000Z",
      distanceKm: 0.4,
    });

    const { groups, debug } = buildBookingDiscoveryGroups({
      fallbackLevel: 1,
      query: {},
      mode: "geo_load",
      quickAccessSlotIds: [`${quick.salonId}|${quick.startTime}|${quick.serviceName}`],
      slots: [
        quick,
        slot({ salonId: "a", serviceName: "Feniranje", startTime: "2026-05-13T11:00:00.000Z", distanceKm: 0.8 }),
        slot({ salonId: "b", serviceName: "Šminkanje", category: "makeup", startTime: "2026-05-13T12:00:00.000Z", distanceKm: 1.2 }),
        slot({ salonId: "c", serviceName: "Pedikir", category: "nails", startTime: "2026-05-13T13:00:00.000Z", distanceKm: 2.1 }),
        slot({ salonId: "d", serviceName: "Balayage", startTime: "2026-05-13T14:00:00.000Z", distanceKm: 3.3 }),
      ],
    });

    expect(types(groups).slice(0, 3)).toEqual([
      "best_nearby",
      "popular_services",
      "recommended_salons",
    ]);
    expect(groups[0].slots.map((s) => s.salonId)).not.toContain("quick");
    expect(debug.afterQuickAccessDedup).toBe(4);
  });
});

import {
  calculateDistanceKm,
  calculateTravelMinutesEstimate,
  hasGeoCoordinates,
  isValidCoordinate,
} from "@/lib/geo/distance";
import { calculateDistanceScore } from "@/lib/geo/geoScore";
import { createGoogleMapsLink } from "@/lib/geo/maps";
import { enrichGeoSignals } from "@/lib/search/enrichGeoSignals";
import { filterByRadius } from "@/lib/search/filterByRadius";
import { rankSearchResults } from "@/lib/search/rankSearchResults";
import type { SearchResult } from "@/types/slots";

function slot(overrides: Partial<SearchResult>): SearchResult {
  return {
    salonId: "salon",
    salonName: "Salon",
    serviceId: "svc",
    serviceName: "Manikir",
    category: "nails",
    startTime: "2026-05-13T10:00:00.000Z",
    city: "Beograd",
    dateLabel: "Sutra",
    timeLabel: "10:00",
    relevanceScore: 0,
    fallbackLevel: 1,
    availabilityConfidence: "calendar_verified",
    ...overrides,
  };
}

describe("geo utility layer", () => {
  it("validates coordinates safely", () => {
    expect(isValidCoordinate(44.8173, "lat")).toBe(true);
    expect(isValidCoordinate(200, "lat")).toBe(false);
    expect(isValidCoordinate(20.4571, "lng")).toBe(true);
    expect(hasGeoCoordinates({ lat: 44.8173, lng: 20.4571 })).toBe(true);
    expect(hasGeoCoordinates({ lat: 44.8173, lng: 220 })).toBe(false);
  });

  it("calculates rounded Haversine distance and rejects invalid input", () => {
    expect(calculateDistanceKm(44.8176, 20.4569, 44.8173, 20.4571)).toBe(0);
    expect(calculateDistanceKm(999, 20.4569, 44.8173, 20.4571)).toBe(Infinity);
  });

  it("estimates travel minutes with a 3 minute minimum", () => {
    expect(calculateTravelMinutesEstimate(0.4)).toBe(3);
    expect(calculateTravelMinutesEstimate(2)).toBe(6);
  });

  it("builds Google Maps links only for valid coordinates", () => {
    expect(createGoogleMapsLink(44.8173, 20.4571)).toBe(
      "https://www.google.com/maps/search/?api=1&query=44.8173,20.4571",
    );
    expect(createGoogleMapsLink(999, 20.4571)).toBe("");
  });

  it("distance score decreases as salons get farther away", () => {
    expect(calculateDistanceScore({ distanceKm: 1 })).toBeGreaterThan(
      calculateDistanceScore({ distanceKm: 7 }),
    );
    expect(calculateDistanceScore({ distanceKm: 7 })).toBeGreaterThan(
      calculateDistanceScore({ distanceKm: 20 }),
    );
  });
});

describe("geo-enriched search slots", () => {
  it("enriches slots with distance, travel estimate, distance score, and maps link", () => {
    const [result] = enrichGeoSignals({
      userLat: 44.8176,
      userLng: 20.4569,
      slots: [slot({ salonLat: 44.8173, salonLng: 20.4571 })],
    });

    expect(result.distanceKm).toBe(0);
    expect(result.travelMinutesEstimate).toBe(3);
    expect(result.distanceScore).toBe(1);
    expect(result.mapsLink).toContain("google.com/maps/search");
  });

  it("never throws or drops slot structure when coordinates are missing", () => {
    const [result] = enrichGeoSignals({
      userLat: 44.8176,
      userLng: 20.4569,
      slots: [slot({ salonId: "missing-geo" })],
    });

    expect(result.salonId).toBe("missing-geo");
    expect(result.distanceKm).toBeUndefined();
  });

  it("radius filtering keeps nearby slots first and unknown-distance slots as last resort", () => {
    const near = slot({ salonId: "near", distanceKm: 2 });
    const far = slot({ salonId: "far", distanceKm: 30 });
    const unknown = slot({ salonId: "unknown" });

    const filtered = filterByRadius({
      slots: [unknown, far, near],
      maxDistanceKm: 10,
    });

    expect(filtered.map((s) => s.salonId)).toEqual(["near", "unknown"]);
  });

  it("ranking consumes precomputed distanceScore without letting distance beat availability", () => {
    const ranked = rankSearchResults({
      strategy: "searchpage",
      fallbackLevel: 1,
      slots: [
        slot({
          salonId: "near-wh",
          distanceKm: 0.2,
          distanceScore: 1,
          availabilityConfidence: "working_hours_only",
        }),
        slot({
          salonId: "far-verified",
          distanceKm: 12,
          distanceScore: 0.3,
          availabilityConfidence: "calendar_verified",
        }),
      ],
    });

    expect(ranked.slots[0].salonId).toBe("far-verified");
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { buildSlotLocationPayload } from "@/lib/geo/locationPayload";
import {
  resolveDistanceOrigin,
  resolveUserLocationOrigin,
} from "@/lib/geo/resolveDistanceOrigin";
import { findBestSlots } from "@/lib/search/findBestSlots";
import type { PlatformSalon } from "@/lib/api/platformClient";
import type { NormalizedSearch } from "@/lib/search/normalizeSearch";

describe("slot location payload", () => {
  it("returns distance and mapsLink with valid coordinates", () => {
    const payload = buildSlotLocationPayload({
      userLat: 44.8176,
      userLng: 20.4569,
      salonLat: 44.8125,
      salonLng: 20.4612,
      salonAddress: "Knez Mihailova 1",
      salonCity: "Beograd",
    });

    expect(payload.distanceKm).toBeGreaterThanOrEqual(0);
    expect(payload.distanceLabel).toMatch(/km/);
    expect(payload.travelMinutesEstimate).toBeGreaterThan(0);
    expect(payload.travelLabel).toMatch(/min/);
    expect(payload.mapsLink).toBe(
      "https://www.google.com/maps/search/?api=1&query=44.8125,20.4612",
    );
    expect(payload.hasSalonLocation).toBe(true);
  });

  it("returns address maps link if coordinates are missing", () => {
    const payload = buildSlotLocationPayload({
      salonAddress: "Knez Mihailova 1",
      salonCity: "Beograd",
    });

    expect(payload.distanceKm).toBeUndefined();
    expect(payload.mapsLink).toBe(
      "https://www.google.com/maps/search/?api=1&query=Knez%20Mihailova%201%20Beograd",
    );
    expect(payload.hasSalonLocation).toBe(true);
  });

  it("invalid coordinates do not crash", () => {
    const payload = buildSlotLocationPayload({
      userLat: 999,
      userLng: 20.4569,
      salonLat: 44.8125,
      salonLng: 220,
    });

    expect(payload.distanceKm).toBeUndefined();
    expect(payload.mapsLink).toBeUndefined();
    expect(payload.hasSalonLocation).toBe(false);
  });

  it("does not create city-only map links", () => {
    const payload = buildSlotLocationPayload({
      salonCity: "Beograd",
    });

    expect(payload.mapsLink).toBeUndefined();
    expect(payload.hasSalonLocation).toBe(false);
  });

  it("uses user coords for distance but salon coords for mapsLink", () => {
    const payload = buildSlotLocationPayload({
      userLat: 45.5062,
      userLng: 19.2606,
      salonLat: 45.2671,
      salonLng: 19.8335,
      salonAddress: "Bulevar oslobođenja 1",
      salonCity: "Novi Sad",
    });

    expect(payload.distanceKm).toBeGreaterThan(50);
    expect(payload.mapsLink).toBe(
      "https://www.google.com/maps/search/?api=1&query=45.2671,19.8335",
    );
    expect(payload.mapsLink).not.toContain("45.5062");
    expect(payload.mapsLink).not.toContain("19.2606");
  });

  it("resolves distance origin by gps, then selected city", () => {
    const selectedCity = { name: "Beograd", lat: 44.8176, lng: 20.4569 };

    expect(
      resolveDistanceOrigin(
        {
          gps: { lat: 45.2671, lng: 19.8335, city: "Novi Sad" },
        },
        selectedCity,
      ),
    ).toMatchObject({ source: "gps", city: "Novi Sad" });

    expect(resolveDistanceOrigin({}, selectedCity)).toMatchObject({
      source: "city",
      city: "Beograd",
    });
  });

  it("ignores approximate GPS for distance and falls back to selected city", () => {
    const selectedCity = { name: "Novi Sad", lat: 45.2671, lng: 19.8335 };
    const signals = {
      gps: {
        lat: 45.5062,
        lng: 19.2606,
        city: "Novi Sad",
        accuracyMeters: 25000,
      },
    };

    expect(resolveDistanceOrigin(signals, selectedCity)).toMatchObject({
      source: "city",
      city: "Novi Sad",
      lat: 45.2671,
      lng: 19.8335,
    });
    expect(resolveUserLocationOrigin(signals)).toBeUndefined();
  });

  it("resolves user location only from gps, never selected city or saved", () => {
    const selectedCity = { name: "Beograd", lat: 44.8176, lng: 20.4569 };

    expect(
      resolveUserLocationOrigin({
        gps: { lat: 45.2671, lng: 19.8335, city: "Novi Sad" },
      }),
    ).toMatchObject({ source: "gps", city: "Novi Sad" });

    expect(resolveUserLocationOrigin({ saved: { city: selectedCity.name } })).toBeUndefined();
  });
});

describe("location payload integration", () => {
  it("SearchResult includes travelMinutesEstimate and mapsLink", () => {
    const salons: PlatformSalon[] = [
      {
        id: "salon-1",
        name: "Kiki Kiss Beauty",
        city: "Beograd",
        lat: 44.8125,
        lng: 20.4612,
        address: "Knez Mihailova 1",
        services: [
          {
            id: "feniranje",
            name: "Feniranje STRAIGHT",
            category: "hair",
            duration: 45,
            price: 2200,
          },
        ],
        nextSlots: [
          {
            startTime: "2026-05-20T10:00:00.000Z",
            serviceId: "feniranje",
          },
        ],
      },
    ];
    const params: NormalizedSearch = {
      citySlug: "beograd",
      cityDisplay: "Beograd",
      cityRef: { name: "Beograd", lat: 44.8176, lng: 20.4569 },
      category: "hair",
      canonicalCategory: "Kosa",
      subcategoryNorm: "feniranje",
      date: "2026-05-20",
      lat: 44.8176,
      lng: 20.4569,
      limit: 10,
    };

    const result = findBestSlots(salons, params, {
      now: new Date("2026-05-19T09:00:00.000Z"),
    });

    expect(result.results[0]).toMatchObject({
      salonAddress: "Knez Mihailova 1",
      mapsLink: "https://www.google.com/maps/search/?api=1&query=44.8125,20.4612",
    });
    expect(result.results[0].travelMinutesEstimate).toBeGreaterThan(0);
  });

  it("SearchResult reads backend street and lat/lng fields", () => {
    const salons: PlatformSalon[] = [
      {
        id: "kiki",
        name: "Kiki Kiss Beauty",
        city: "Beograd",
        street: "Knez Mihajlova 33ab",
        lat: 44.8173,
        lng: 20.4571,
        services: [
          {
            id: "makeup",
            name: "Šminkanje",
            category: "makeup",
            duration: 90,
            price: 2800,
          },
        ],
        nextSlots: [
          {
            startTime: "2026-05-20T12:00:00.000Z",
            serviceId: "makeup",
          },
        ],
      },
    ];
    const params: NormalizedSearch = {
      citySlug: "beograd",
      cityDisplay: "Beograd",
      cityRef: { name: "Beograd", lat: 44.8176, lng: 20.4569 },
      category: "makeup",
      canonicalCategory: "Šminka",
      subcategoryNorm: "sminkanje",
      date: "2026-05-20",
      lat: 44.8176,
      lng: 20.4569,
      limit: 10,
    };

    const result = findBestSlots(salons, params, {
      now: new Date("2026-05-19T09:00:00.000Z"),
    });

    expect(result.results[0]).toMatchObject({
      salonAddress: "Knez Mihajlova 33ab",
      salonLat: 44.8173,
      salonLng: 20.4571,
      mapsLink: "https://www.google.com/maps/search/?api=1&query=44.8173,20.4571",
    });
  });

  it("SlotCard renders distance and map affordances conditionally", () => {
    const quickAccess = readFileSync(
      path.join(process.cwd(), "src/components/landing/QuickAccess.tsx"),
      "utf8",
    );
    const bookingWidget = readFileSync(
      path.join(process.cwd(), "src/components/landing/BookingWidget.tsx"),
      "utf8",
    );

    expect(quickAccess).toContain("formatDistance(displayDistanceKm)");
    expect(quickAccess).toContain("salonMapLink || slot.mapsLink");
    expect(quickAccess).toContain("userLocation={userLocationOrigin}");
    expect(quickAccess).toContain("Mapa");
    expect(bookingWidget).toContain("formatDistance(displayDistanceKm)");
    expect(bookingWidget).toContain("salonMapLink || slot.mapsLink");
    expect(bookingWidget).toContain("userLocation={userLocationOrigin}");
    expect(bookingWidget).toContain("Mapa");
  });

  it("SearchProvider sends distance origin coordinates to search", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/context/landing/SearchContext.tsx"),
      "utf8",
    );

    expect(source).toContain("resolveDistanceOrigin(geoSignals, city)");
    expect(source).toContain("lat: distanceOrigin?.lat");
    expect(source).toContain("lng: distanceOrigin?.lng");
  });

  it("City selector no longer fetches IP geo for user location", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/hooks/useCitySelector.ts"),
      "utf8",
    );

    expect(source).not.toContain("/api/geo/ip");
  });

  it("Appointment list renders Prikaži mapu when mapsLink exists", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/blocks/ClientBlockAppointments.tsx"),
      "utf8",
    );

    expect(source).toContain("appointmentMapsLink");
    expect(source).toContain("Prikaži mapu");
    expect(source).toContain("formatDistance(currentAppointment.distanceKm)");
  });

  it("email and booking payload include mapsLink when available", () => {
    const emailSource = readFileSync(
      path.join(process.cwd(), "src/lib/availability/notifyAvailabilityWatch.ts"),
      "utf8",
    );
    const modalSource = readFileSync(
      path.join(process.cwd(), "src/components/landing/BookingModal.tsx"),
      "utf8",
    );

    expect(emailSource).toContain("slot.mapsLink");
    expect(emailSource).toContain("Prikaži lokaciju");
    expect(modalSource).toContain("mapsLink: normalized.mapsLink");
    expect(modalSource).toContain("Kopiraj link do lokacije");
  });
});

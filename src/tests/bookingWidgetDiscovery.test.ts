import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveFallbackPolicy, applyFallbackPolicy } from "@/lib/availability/fallbackPolicy";
import { buildBookingDiscoveryGroups } from "@/lib/search/buildBookingDiscoveryGroups";
import { bookingWidgetRecoveryCopy } from "@/lib/search/bookingWidgetRecoveryCopy";
import type { SearchResult } from "@/types/slots";

function slot(overrides: Partial<SearchResult>): SearchResult {
  return {
    salonId: "salon",
    salonName: "Salon",
    serviceId: "svc",
    serviceName: "Botox kose",
    category: "hair",
    startTime: "2026-05-18T10:00:00.000Z",
    city: "Novi Sad",
    dateLabel: "Danas",
    timeLabel: "10:00",
    relevanceScore: 0,
    fallbackLevel: 5,
    availabilityConfidence: "calendar_verified",
    ...overrides,
  };
}

describe("BookingWidget discovery recovery", () => {
  it("selected city with no salons uses nearby copy, not service-not-recognized", () => {
    const copy = bookingWidgetRecoveryCopy({
      city: "Sremska Mitrovica",
      recoveryState: {
        requestedCity: "Sremska Mitrovica",
        reason: "no_city_salons",
      },
    });

    expect(copy?.title).toBe(
      "Nema salona u Sremskoj Mitrovici. Prikazujemo najbliže slobodne termine.",
    );
    expect(copy?.title).not.toContain("Nismo prepoznali");
  });

  it("selected city with salons but no slots uses nearest alternatives copy", () => {
    const copy = bookingWidgetRecoveryCopy({
      city: "Sremska Mitrovica",
      recoveryState: {
        requestedCity: "Sremska Mitrovica",
        reason: "no_city_slots",
      },
    });

    expect(copy?.title).toBe(
      "Nema slobodnih termina u Sremskoj Mitrovici. Prikazujemo najbliže dostupne termine.",
    );
  });

  it("unknown service is the only reason that uses service-not-recognized copy", () => {
    const copy = bookingWidgetRecoveryCopy({
      city: "Novi Sad",
      recoveryState: {
        requestedCity: "Novi Sad",
        reason: "no_service_match",
      },
    });

    expect(copy?.title).toBe("Nismo prepoznali tačno ovu uslugu.");
  });

  it("BookingWidget accepts L5 nearby and L6 synthetic discovery slots", () => {
    const policy = resolveFallbackPolicy("bookingwidget", { kind: "discovery" });
    const accepted = applyFallbackPolicy(
      [
        slot({ fallbackLevel: 5, slotOrigins: ["nearby_city"] }),
        slot({
          fallbackLevel: 6,
          isSynthetic: true,
          availabilityConfidence: "synthetic_projection",
          slotOrigins: ["synthetic"],
        }),
      ],
      policy,
    );

    expect(accepted).toHaveLength(2);
  });

  it("BookingWidget uses discovery fallback and marks synthetic slots", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/landing/BookingWidget.tsx"),
      "utf8",
    );

    // BookingWidget falls back to the discovery pool whenever the strict
    // `results` array is empty, and prefers it whole-sale in city-recovery
    // mode so the cascade can bucket by city. The exact expression has
    // moved from one ternary to a guarded branch — both forms below cover
    // the legacy and the cascade-aware shape.
    expect(source).toMatch(
      /results\.length\s*>\s*0\s*\?\s*results\s*:\s*discovery/,
    );
    expect(source).toMatch(/discovery\.length\s*>\s*0\s*\?\s*discovery\s*:\s*results/);
    expect(source).toContain('recoveryState?.reason === "no_city_salons"');
    expect(source).toContain("mogući termin");
    expect(source).not.toContain("<RecoveryCTA");
  });

  it("search API keeps QuickAccess results strict while BookingWidget gets broad discovery", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/app/api/search/route.ts"),
      "utf8",
    );

    expect(source).toContain('cityDisplay: "__bookingwidget_discovery__"');
    expect(source).toContain("const strictGeoResults = enrichGeoSignals");
    expect(source).toContain("const discoveryGeoResults = enrichGeoSignals");
    expect(source).toContain("slots: strictGeoResults");
    expect(source).toContain("discovery: discoveryGeoResults");
  });

  it("no-city recovery fills nearest discovery rows from nearby slots", () => {
    const slots = [
      slot({ salonId: "ns-1", city: "Novi Sad", serviceName: "Botox kose", fallbackLevel: 5 }),
      slot({ salonId: "ns-2", city: "Novi Sad", serviceName: "Feniranje", fallbackLevel: 5 }),
      slot({ salonId: "bg-1", city: "Beograd", serviceName: "Šišanje", fallbackLevel: 5 }),
      slot({ salonId: "bg-2", city: "Beograd", serviceName: "Farbanje", fallbackLevel: 5 }),
      slot({ salonId: "bor-1", city: "Bor", serviceName: "Tretman kose", fallbackLevel: 6, isSynthetic: true, availabilityConfidence: "synthetic_projection", slotOrigins: ["synthetic"] }),
    ];

    const built = buildBookingDiscoveryGroups({
      slots: slots as never,
      quickAccessSlotIds: [],
      query: { city: "Sremska Mitrovica" },
      userCity: "Sremska Mitrovica",
      fallbackLevel: 5,
      mode: "geo_load",
      recoveryState: {
        requestedCity: "Sremska Mitrovica",
        effectiveCity: "Sremska Mitrovica",
        reason: "no_city_salons",
        selectedCityHasSalons: false,
        selectedCityHasSlots: false,
        expandedToCities: ["Novi Sad", "Beograd", "Bor"],
      },
    });

    expect(built.groups[0]).toMatchObject({
      title: "Najbliži slobodni termini",
    });
    expect(built.groups[0].slots.length).toBeGreaterThan(0);
    expect(built.groups.some((group) => group.slots.length > 0)).toBe(true);
  });

  it("QuickAccess still owns strict RecoveryCTA", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/landing/QuickAccess.tsx"),
      "utf8",
    );

    expect(source).toContain("<RecoveryCTA");
  });
});

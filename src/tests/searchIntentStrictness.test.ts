import { resolveFallbackPolicy, applyFallbackPolicy } from "@/lib/availability/fallbackPolicy";
import type { PlatformSalon } from "@/lib/api/platformClient";
import { findBestSlots } from "@/lib/search/findBestSlots";
import { normalizeSearch, type NormalizedSearch } from "@/lib/search/normalizeSearch";
import { normalizeSearchIntent } from "@/lib/search/normalizeSearchIntent";
import { bookingWidgetRecoveryCopy } from "@/lib/search/bookingWidgetRecoveryCopy";
import type { SearchResult } from "@/types/slots";

const NOW = new Date("2026-05-19T08:00:00.000Z");
const DATE = "2026-05-20";

function belgradeHour(iso: string): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Belgrade",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso)),
  );
}

function makeSalon(params: {
  id: string;
  city: string;
  serviceName: string;
  category: string;
  nextSlots?: string[];
  workingHours?: Record<string, string>;
}): PlatformSalon {
  const serviceId = `${params.id}-svc`;
  return {
    _id: params.id,
    id: params.id,
    name: `Salon ${params.id}`,
    city: params.city,
    lat: params.city === "Subotica" ? 46.1 : params.city === "Bor" ? 44.07 : 45.26,
    lng: params.city === "Subotica" ? 19.66 : params.city === "Bor" ? 22.1 : 19.83,
    services: [
      {
        _id: serviceId,
        id: serviceId,
        name: params.serviceName,
        duration: 45,
        basePrice: 1500,
        category: params.category,
      },
    ],
    nextSlots: (params.nextSlots ?? []).map((startTime) => ({
      startTime,
      serviceId,
    })),
    workingHours: params.workingHours,
  };
}

function paramsFromQuery(query: string, selectedCity: string): NormalizedSearch {
  const intent = normalizeSearchIntent({ rawQuery: query, city: selectedCity });
  return normalizeSearch({
    city: intent.city ?? selectedCity,
    category: intent.categoryKey,
    subcategory: intent.shouldSearchCategoryBucket ? undefined : intent.originalQuery,
    date: DATE,
    timeWindowStart: intent.timeWindowStart,
    timeWindowEnd: intent.timeWindowEnd,
    rawQuery: query,
    serviceCandidates: intent.shouldUseSemanticExpansion
      ? intent.serviceCandidates
      : intent.normalizedQuery
        ? [intent.originalQuery]
        : undefined,
    limit: 20,
  });
}

describe("search intent time window and service strictness", () => {
  it("feniranje Novi Sad posle 15h returns only Novi Sad/feniranje slots at or after 15:00", () => {
    const params = paramsFromQuery("feniranje Novi Sad posle 15h", "Subotica");
    const result = findBestSlots(
      [
        makeSalon({
          id: "ns-hair",
          city: "Novi Sad",
          serviceName: "Feniranje",
          category: "Kosa",
          nextSlots: [`${DATE}T08:00:00.000Z`, `${DATE}T14:00:00.000Z`],
        }),
        makeSalon({
          id: "bor-massage",
          city: "Bor",
          serviceName: "Maderoterapija",
          category: "Masaža",
          nextSlots: [`${DATE}T14:00:00.000Z`],
        }),
      ],
      params,
      { now: NOW },
    );

    expect(params.cityDisplay).toBe("Novi Sad");
    expect(params.timeWindowStart).toBe(15);
    expect(params.timeWindowEnd).toBeNull();
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results.every((slot) => slot.city === "Novi Sad")).toBe(true);
    expect(result.results.every((slot) => slot.serviceName.toLowerCase().includes("feniranje"))).toBe(true);
    expect(result.results.every((slot) => belgradeHour(slot.startTime) >= 15)).toBe(true);
  });

  it("feniranje posle 15h with selected Subotica can expand city while keeping service and time strict", () => {
    const params = paramsFromQuery("feniranje posle 15h", "Subotica");
    const result = findBestSlots(
      [
        makeSalon({
          id: "ns-hair",
          city: "Novi Sad",
          serviceName: "Feniranje",
          category: "Kosa",
          nextSlots: [`${DATE}T07:00:00.000Z`, `${DATE}T14:30:00.000Z`],
        }),
        makeSalon({
          id: "bor-massage",
          city: "Bor",
          serviceName: "Maderoterapija",
          category: "Masaža",
          nextSlots: [`${DATE}T15:00:00.000Z`],
        }),
      ],
      params,
      { now: NOW },
    );

    expect(params.cityDisplay).toBe("Subotica");
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results.every((slot) => slot.category === "hair")).toBe(true);
    expect(result.results.every((slot) => slot.serviceName.toLowerCase().includes("feniranje"))).toBe(true);
    expect(result.results.every((slot) => belgradeHour(slot.startTime) >= 15)).toBe(true);
  });

  it("maderoterapija posle 15h with selected Subotica does not drift to Kosa/Novi Sad", () => {
    const params = paramsFromQuery("maderoterapija posle 15h", "Subotica");
    const result = findBestSlots(
      [
        makeSalon({
          id: "ns-hair",
          city: "Novi Sad",
          serviceName: "Feniranje",
          category: "Kosa",
          nextSlots: [`${DATE}T14:30:00.000Z`],
        }),
        makeSalon({
          id: "bor-massage",
          city: "Bor",
          serviceName: "Maderoterapija",
          category: "Masaža",
          nextSlots: [`${DATE}T14:30:00.000Z`],
        }),
      ],
      params,
      { now: NOW },
    );

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results.some((slot) => slot.category === "hair" || slot.city === "Novi Sad")).toBe(false);
    expect(result.results.every((slot) => slot.category === "massage")).toBe(true);
    expect(result.results.every((slot) => belgradeHour(slot.startTime) >= 15)).toBe(true);
  });

  it("maderoterapija may expand to Bor/Masaža when selected city has no strict match", () => {
    const params = paramsFromQuery("maderoterapija posle 15h", "Subotica");
    const result = findBestSlots(
      [
        makeSalon({
          id: "bor-massage",
          city: "Bor",
          serviceName: "Maderoterapija",
          category: "Masaža",
          nextSlots: [`${DATE}T14:00:00.000Z`],
        }),
      ],
      params,
      { now: NOW },
    );

    expect(result.results[0]?.city).toBe("Bor");
    expect(result.results[0]?.category).toBe("massage");
  });

  it("explicit service fallback disallows unrelated category drift in BookingWidget policy", () => {
    const slots: SearchResult[] = [
      {
        salonId: "hair",
        salonName: "Hair",
        serviceId: "hair-svc",
        serviceName: "Feniranje",
        category: "hair",
        startTime: `${DATE}T14:00:00.000Z`,
        city: "Novi Sad",
        dateLabel: "Sutra",
        timeLabel: "16:00",
        relevanceScore: 0,
        fallbackLevel: 5,
        slotOrigins: ["nearby_city", "related_service"],
      },
      {
        salonId: "massage",
        salonName: "Massage",
        serviceId: "massage-svc",
        serviceName: "Maderoterapija",
        category: "massage",
        startTime: `${DATE}T14:00:00.000Z`,
        city: "Bor",
        dateLabel: "Sutra",
        timeLabel: "16:00",
        relevanceScore: 0,
        fallbackLevel: 5,
        slotOrigins: ["nearby_city"],
      },
    ];

    const policy = resolveFallbackPolicy("bookingwidget", { kind: "explicit_service" });
    expect(applyFallbackPolicy(slots, policy).map((slot) => slot.salonId)).toEqual(["massage"]);
  });

  it("unknown service query shows service-not-recognized recovery copy", () => {
    const copy = bookingWidgetRecoveryCopy({
      city: "Novi Sad",
      recoveryState: { requestedCity: "Novi Sad", reason: "no_service_match" },
      hasSearchIntent: true,
    });

    expect(copy?.title).toBe("Nismo prepoznali tačno ovu uslugu.");
    expect(copy?.body).toBe("Pogledajte dostupne kategorije.");
  });

  it("query city overrides selected city", () => {
    const intent = normalizeSearchIntent({
      rawQuery: "feniranje Novi Sad posle 15h",
      city: "Subotica",
    });

    expect(intent.city).toBe("Novi Sad");
    expect(intent.originalQuery).toBe("feniranje");
  });

  it("timeWindowStart applies to working-hours generated slots too", () => {
    const params = paramsFromQuery("feniranje posle 15h", "Novi Sad");
    const result = findBestSlots(
      [
        makeSalon({
          id: "ns-hair",
          city: "Novi Sad",
          serviceName: "Feniranje",
          category: "Kosa",
          workingHours: {
            Sreda: "08:00-18:00",
          },
        }),
      ],
      params,
      { now: NOW },
    );

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results.every((slot) => belgradeHour(slot.startTime) >= 15)).toBe(true);
  });
});

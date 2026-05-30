// src/tests/slicePlatformKnowledge.test.ts

import {
  slicePlatformKnowledge,
  sliceFromCollected,
} from "@/lib/ai/slicePlatformKnowledge";
import type { PlatformKnowledge } from "@/lib/ai/platform-knowledge";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SALONS = [
  { _id: "bg-1", name: "Kiki Kiss Beauty", city: "Beograd" },
  { _id: "bg-2", name: "Belissimo", city: "Beograd" },
  { _id: "ns-1", name: "Shi Sham Frizerski Salon", city: "Novi Sad" },
  { _id: "ns-2", name: "Pink Studio", city: "Novi Sad" },
  { _id: "bor-1", name: "Beauty M Glow", city: "Bor" },
];

const SERVICES = [
  // Beograd — Kiki Kiss
  {
    _id: "s1",
    name: "Šminkanje svečano",
    category: "Šminka",
    basePrice: 2500,
    duration: 60,
    salonId: "bg-1",
    salonName: "Kiki Kiss Beauty",
    city: "Beograd",
  },
  {
    _id: "s2",
    name: "Šminkanje dnevno",
    category: "Šminka",
    basePrice: 1800,
    duration: 45,
    salonId: "bg-1",
    salonName: "Kiki Kiss Beauty",
    city: "Beograd",
  },
  {
    _id: "s3",
    name: "Feniranje",
    category: "Kosa",
    basePrice: 1500,
    duration: 45,
    salonId: "bg-1",
    salonName: "Kiki Kiss Beauty",
    city: "Beograd",
  },
  {
    _id: "s4",
    name: "Šišanje",
    category: "Kosa",
    basePrice: 1200,
    duration: 30,
    salonId: "bg-1",
    salonName: "Kiki Kiss Beauty",
    city: "Beograd",
  },
  // Beograd — Belissimo
  {
    _id: "s5",
    name: "Masaža relaks",
    category: "Masaža",
    basePrice: 3000,
    duration: 60,
    salonId: "bg-2",
    salonName: "Belissimo",
    city: "Beograd",
  },
  {
    _id: "s6",
    name: "Maderoterapija",
    category: "Masaža",
    basePrice: 3500,
    duration: 60,
    salonId: "bg-2",
    salonName: "Belissimo",
    city: "Beograd",
  },
  // Novi Sad — Shi Sham
  {
    _id: "s7",
    name: "Feniranje BLOWOUT",
    category: "Kosa",
    basePrice: 1500,
    duration: 60,
    salonId: "ns-1",
    salonName: "Shi Sham Frizerski Salon",
    city: "Novi Sad",
  },
  {
    _id: "s8",
    name: "Šišanje i fen",
    category: "Kosa",
    basePrice: 1800,
    duration: 60,
    salonId: "ns-1",
    salonName: "Shi Sham Frizerski Salon",
    city: "Novi Sad",
  },
  {
    _id: "s9",
    name: "Nokti gel",
    category: "Nokti",
    basePrice: 2200,
    duration: 90,
    salonId: "ns-1",
    salonName: "Shi Sham Frizerski Salon",
    city: "Novi Sad",
  },
  // Novi Sad — Pink Studio
  {
    _id: "s10",
    name: "Manikir",
    category: "Nokti",
    basePrice: 1500,
    duration: 45,
    salonId: "ns-2",
    salonName: "Pink Studio",
    city: "Novi Sad",
  },
  {
    _id: "s11",
    name: "Pedikir",
    category: "Nokti",
    basePrice: 1800,
    duration: 60,
    salonId: "ns-2",
    salonName: "Pink Studio",
    city: "Novi Sad",
  },
  // Bor
  {
    _id: "s12",
    name: "Anticelulit masaža",
    category: "Masaža",
    basePrice: 2500,
    duration: 60,
    salonId: "bor-1",
    salonName: "Beauty M Glow",
    city: "Bor",
  },
];

const PLATFORM: PlatformKnowledge = {
  salonsText: "",
  servicesText: "",
  citiesText: "Beograd, Novi Sad, Bor",
  categoriesText: "",
  raw: { salons: SALONS as never, services: SERVICES as never, categories: [] },
};

// ---------------------------------------------------------------------------
// 1. City filter
// ---------------------------------------------------------------------------

describe("slicePlatformKnowledge — city filter", () => {
  it("returns only Beograd salons when city=Beograd", () => {
    const slice = slicePlatformKnowledge(PLATFORM, { city: "Beograd" });
    expect(slice.salonsText).toContain("Kiki Kiss Beauty");
    expect(slice.salonsText).toContain("Belissimo");
    expect(slice.salonsText).not.toContain("Shi Sham");
    expect(slice.salonsText).not.toContain("Beauty M Glow");
  });

  it("returns only Novi Sad salons when city=Novi Sad", () => {
    const slice = slicePlatformKnowledge(PLATFORM, { city: "Novi Sad" });
    expect(slice.salonsText).toContain("Shi Sham");
    expect(slice.salonsText).toContain("Pink Studio");
    expect(slice.salonsText).not.toContain("Kiki Kiss");
  });

  it("returns only Bor services when city=Bor", () => {
    const slice = slicePlatformKnowledge(PLATFORM, { city: "Bor" });
    expect(slice.servicesText).toContain("Anticelulit");
    expect(slice.servicesText).not.toContain("Feniranje BLOWOUT");
  });

  it("returns all salons (capped) when no city", () => {
    const slice = slicePlatformKnowledge(PLATFORM, {});
    expect(slice.debug.filteredSalons).toBeLessThanOrEqual(8);
    expect(slice.debug.filterReason).toContain("no_context_cap");
  });

  it("returns all salons as fallback when city has no match", () => {
    const slice = slicePlatformKnowledge(PLATFORM, { city: "Ruma" });
    // Nema salona u Rumi — Claudia treba sve salone da kaže "nemamo u Rumi"
    expect(slice.debug.filteredSalons).toBe(SALONS.length);
    expect(slice.debug.filterReason).toContain("city_no_match_fallback");
  });

  it("citiesText always contains all platform cities", () => {
    const slice = slicePlatformKnowledge(PLATFORM, { city: "Beograd" });
    expect(slice.citiesText).toContain("Beograd");
    expect(slice.citiesText).toContain("Novi Sad");
    expect(slice.citiesText).toContain("Bor");
  });
});

// ---------------------------------------------------------------------------
// 2. Service keyword filter
// ---------------------------------------------------------------------------

describe("slicePlatformKnowledge — service keyword filter", () => {
  it("returns only feniranje-related services when service=feniranje", () => {
    const slice = slicePlatformKnowledge(PLATFORM, {
      city: "Beograd",
      service: "feniranje",
    });
    expect(slice.servicesText).toContain("Feniranje");
    expect(slice.servicesText).not.toContain("Šminkanje");
    expect(slice.servicesText).not.toContain("Masaža");
  });

  it("returns šminkanje variants when service=šminkanje", () => {
    const slice = slicePlatformKnowledge(PLATFORM, {
      city: "Beograd",
      service: "šminkanje",
    });
    expect(slice.servicesText).toContain("Šminkanje svečano");
    expect(slice.servicesText).toContain("Šminkanje dnevno");
    expect(slice.servicesText).not.toContain("Feniranje");
    expect(slice.servicesText).not.toContain("Masaža");
  });

  it("returns masaža services via semantic category", () => {
    const slice = slicePlatformKnowledge(PLATFORM, {
      service: "masaža",
    });
    expect(slice.servicesText).toContain("Masaža relaks");
    expect(slice.servicesText).toContain("Maderoterapija");
    expect(slice.servicesText).toContain("Anticelulit");
  });

  it("maderoterapija matches via semantic synonym", () => {
    const slice = slicePlatformKnowledge(PLATFORM, {
      service: "maderoterapija",
    });
    expect(slice.servicesText).toContain("Maderoterapija");
  });

  it("nokti returns manikir and pedikir via category", () => {
    const slice = slicePlatformKnowledge(PLATFORM, {
      city: "Novi Sad",
      service: "nokti",
    });
    expect(slice.servicesText).toContain("Manikir");
    expect(slice.servicesText).toContain("Pedikir");
    expect(slice.servicesText).not.toContain("Feniranje");
  });

  it("caps services at 15 when keyword matches", () => {
    const slice = slicePlatformKnowledge(PLATFORM, { service: "kosa" });
    expect(slice.debug.filteredServices).toBeLessThanOrEqual(15);
  });

  it("caps services at 20 when no keyword", () => {
    const slice = slicePlatformKnowledge(PLATFORM, { city: "Beograd" });
    expect(slice.debug.filteredServices).toBeLessThanOrEqual(20);
  });
});

// ---------------------------------------------------------------------------
// 3. Salon name filter
// ---------------------------------------------------------------------------

describe("slicePlatformKnowledge — salon name filter", () => {
  it("returns only Kiki Kiss when salonName specified", () => {
    const slice = slicePlatformKnowledge(PLATFORM, {
      salonName: "Kiki Kiss",
    });
    expect(slice.salonsText).toContain("Kiki Kiss Beauty");
    expect(slice.salonsText).not.toContain("Belissimo");
    expect(slice.salonsText).not.toContain("Shi Sham");
    expect(slice.debug.filterReason).toContain("explicit_salon_name");
  });

  it("partial name match works — 'Shi Sham' matches 'Shi Sham Frizerski Salon'", () => {
    const slice = slicePlatformKnowledge(PLATFORM, {
      salonName: "Shi Sham",
    });
    expect(slice.salonsText).toContain("Shi Sham Frizerski Salon");
    expect(slice.salonsText).not.toContain("Kiki Kiss");
  });

  it("returns only Kiki Kiss services when salon + service specified", () => {
    const slice = slicePlatformKnowledge(PLATFORM, {
      salonName: "Kiki Kiss",
      service: "feniranje",
    });
    expect(slice.servicesText).toContain("Feniranje");
    expect(slice.servicesText).not.toContain("Anticelulit");
    expect(slice.servicesText).not.toContain("Feniranje BLOWOUT"); // Shi Sham, not Kiki Kiss
  });
});

// ---------------------------------------------------------------------------
// 4. Nearest city candidates filter
// ---------------------------------------------------------------------------

describe("slicePlatformKnowledge — nearest city candidates", () => {
  it("returns salons from candidate cities only", () => {
    const slice = slicePlatformKnowledge(PLATFORM, {
      nearestCityCandidates: ["Novi Sad", "Beograd"],
      service: "feniranje",
    });
    expect(slice.salonsText).toContain("Shi Sham");
    expect(slice.salonsText).toContain("Kiki Kiss");
    expect(slice.salonsText).not.toContain("Beauty M Glow"); // Bor nije kandidat
    expect(slice.debug.filterReason).toContain("nearest_city_candidates");
  });

  it("city filter takes precedence over candidates when both set", () => {
    // Explicit city wins — candidates su za "nema u tom gradu" flow
    const slice = slicePlatformKnowledge(PLATFORM, {
      city: "Bor",
      nearestCityCandidates: ["Novi Sad"],
    });
    // Explicit city=Bor → samo Bor
    expect(slice.salonsText).toContain("Beauty M Glow");
    expect(slice.salonsText).not.toContain("Shi Sham");
  });

  it("feniranje in nearest candidates returns only feniranje services from those cities", () => {
    const slice = slicePlatformKnowledge(PLATFORM, {
      nearestCityCandidates: ["Novi Sad"],
      service: "feniranje",
    });
    expect(slice.servicesText).toContain("Feniranje BLOWOUT");
    expect(slice.servicesText).not.toContain("Anticelulit"); // Bor
  });
});

// ---------------------------------------------------------------------------
// 5. Token reduction — the actual goal
// ---------------------------------------------------------------------------

describe("slicePlatformKnowledge — token reduction", () => {
  it("reduces service count significantly with city+service context", () => {
    const noCtx = slicePlatformKnowledge(PLATFORM, {});
    const withCtx = slicePlatformKnowledge(PLATFORM, {
      city: "Beograd",
      service: "feniranje",
    });
    expect(withCtx.debug.filteredServices).toBeLessThan(
      noCtx.debug.filteredServices,
    );
  });

  it("slice for booking has fewer services than full platform", () => {
    const slice = slicePlatformKnowledge(PLATFORM, {
      city: "Novi Sad",
      service: "nokti",
      queryType: "booking",
    });
    expect(slice.debug.filteredServices).toBeLessThan(SERVICES.length);
  });
});

// ---------------------------------------------------------------------------
// 6. sliceFromCollected convenience wrapper
// ---------------------------------------------------------------------------

describe("sliceFromCollected", () => {
  it("works with undefined collected", () => {
    const slice = sliceFromCollected(PLATFORM, undefined);
    expect(slice.salonsText).toBeTruthy();
    expect(slice.citiesText).toContain("Beograd");
  });

  it("passes city and service from collected", () => {
    const slice = sliceFromCollected(PLATFORM, {
      city: "Beograd",
      service: "šminkanje",
    });
    expect(slice.salonsText).toContain("Kiki Kiss");
    expect(slice.servicesText).toContain("Šminkanje");
    expect(slice.servicesText).not.toContain("Masaža");
  });

  it("passes nearestCityCandidates from opts", () => {
    const slice = sliceFromCollected(
      PLATFORM,
      { service: "feniranje" },
      { nearestCityCandidates: ["Novi Sad"] },
    );
    expect(slice.salonsText).toContain("Shi Sham");
    expect(slice.salonsText).not.toContain("Beauty M Glow");
  });
});

// ---------------------------------------------------------------------------
// 7. Output format
// ---------------------------------------------------------------------------

describe("slicePlatformKnowledge — output format", () => {
  it("salonsText contains salon id, name, city", () => {
    const slice = slicePlatformKnowledge(PLATFORM, { city: "Beograd" });
    expect(slice.salonsText).toMatch(/\[bg-\d\]/);
    expect(slice.salonsText).toContain("Beograd");
  });

  it("servicesText contains price and duration", () => {
    const slice = slicePlatformKnowledge(PLATFORM, {
      city: "Beograd",
      service: "feniranje",
    });
    expect(slice.servicesText).toContain("RSD");
    expect(slice.servicesText).toContain("min");
  });

  it("servicesText contains salon name for context", () => {
    const slice = slicePlatformKnowledge(PLATFORM, {
      city: "Beograd",
      service: "šminkanje",
    });
    expect(slice.servicesText).toContain("Kiki Kiss Beauty");
  });

  it("never returns undefined in text output", () => {
    const slice = slicePlatformKnowledge(PLATFORM, {
      city: "Beograd",
      service: "feniranje",
    });
    expect(slice.salonsText).not.toContain("undefined");
    expect(slice.servicesText).not.toContain("undefined");
  });
});

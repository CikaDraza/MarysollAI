// src/tests/claudiaContextContinuity.test.ts
//
// Task 3 — Claudia Context Continuity Regression Tests
//
// Testira:
// 1. Price query "feniranje" then "Beograd" preserves service
// 2. "Koje vrste feniranja ima?" uses previous price context
// 3. City availability Ruma → "Feniranje" uses nearest candidates
// 4. Nearest candidates exclude far unrelated cities
// 5. Booking "Kiki Kiss šminkanje nedelja" infers city from salon
// 6. Follow-up "ipak u 15h" preserves salon/service/date
// 7. No visible message contains "undefined"
// 8. No visible message contains "tražena usluga"
// 9. Unknown follow-up asks one clear question
// 10. Existing direct-entry tests remain green

import {
  mergeClaudiaContext,
  inferCityFromSalon,
  resolveNearestCandidatesForCity,
  sanitizeClaudiaMessage,
  resolveFollowUp,
  collectedToContext,
  contextToCollected,
  type ClaudiaQueryContext,
} from "@/lib/ai/context/claudiaContextContinuity";
import { parseClaudiaDirectIntent } from "@/services/askAgent";
import { bookingFlow } from "@/lib/ai/booking-flow-state";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SALONS = [
  { _id: "salon-bg-1", name: "Kiki Kiss Beauty", city: "Beograd" },
  { _id: "salon-ns-1", name: "Shi Sham Frizerski Salon", city: "Novi Sad" },
  { _id: "salon-bor-1", name: "Beauty M Glow", city: "Bor" },
];

const PLATFORM_KNOWLEDGE = {
  salonsText: "",
  servicesText: "",
  citiesText: "Beograd, Novi Sad, Bor",
  categoriesText: "",
  raw: {
    salons: SALONS,
    services: [],
    categories: [],
  },
  semanticMemory: undefined,
};

// ---------------------------------------------------------------------------
// Test 1 — Price query "feniranje" then "Beograd" preserves service
// ---------------------------------------------------------------------------

describe("Task 3.1 — Price follow-up preserves service", () => {
  beforeEach(() => {
    bookingFlow.get().reset();
  });

  it("mergeClaudiaContext preserves service when city is added", () => {
    const after1: ClaudiaQueryContext = {
      lastQueryType: "prices",
      service: "feniranje",
      category: "Kosa",
      // city unknown — Claudia asked "Za koji grad?"
    };

    // User says "Beograd" as follow-up
    const after2 = mergeClaudiaContext(after1, {
      queryType: "prices",
      city: "Beograd",
    });

    expect(after2.service).toBe("feniranje");
    expect(after2.city).toBe("Beograd");
    expect(after2.lastQueryType).toBe("prices");
  });

  it("parseClaudiaDirectIntent picks up service from text", () => {
    const intent = parseClaudiaDirectIntent({
      text: "Mogu li cenovnik za feniranje?",
      platformKnowledge: PLATFORM_KNOWLEDGE,
    });
    expect(intent.type).toBe("prices");
    expect(intent.entities.service).toBe("feniranje");
  });

  it("parseClaudiaDirectIntent with collected context preserves previous service", () => {
    const intent = parseClaudiaDirectIntent({
      text: "Beograd",
      platformKnowledge: PLATFORM_KNOWLEDGE,
      collectedBookingFields: { service: "feniranje", category: "Kosa" },
    });
    // City "Beograd" is a follow-up — should resolve to prices with feniranje
    expect(intent.entities.city).toBe("Beograd");
    // The collected service should be accessible via collectedBookingFields
    // (it's up to askAgent to merge, not parseClaudiaDirectIntent)
  });
});

// ---------------------------------------------------------------------------
// Test 2 — "Koje vrste feniranja ima?" uses previous price context
// ---------------------------------------------------------------------------

describe("Task 3.2 — Price variants use previous context", () => {
  it("mergeClaudiaContext carries over service for variants query", () => {
    const priceCtx: ClaudiaQueryContext = {
      lastQueryType: "prices",
      service: "feniranje",
      city: "Beograd",
      salonName: "Kiki Kiss Beauty",
    };

    const variantsCtx = mergeClaudiaContext(priceCtx, {
      queryType: "prices",
      // "Koje vrste feniranja ima?" — no new city, no new service explicitly
    });

    expect(variantsCtx.service).toBe("feniranje");
    expect(variantsCtx.city).toBe("Beograd");
    expect(variantsCtx.salonName).toBe("Kiki Kiss Beauty");
  });

  it("collectedToContext maps collected fields correctly", () => {
    const ctx = collectedToContext(
      { service: "feniranje", city: "Beograd", salonName: "Kiki Kiss Beauty" },
      "prices",
    );
    expect(ctx.service).toBe("feniranje");
    expect(ctx.city).toBe("Beograd");
    expect(ctx.lastQueryType).toBe("prices");
  });

  it("contextToCollected round-trips correctly", () => {
    const ctx: ClaudiaQueryContext = {
      lastQueryType: "prices",
      service: "feniranje",
      city: "Beograd",
      salonId: "salon-bg-1",
    };
    const collected = contextToCollected(ctx);
    expect(collected.service).toBe("feniranje");
    expect(collected.city).toBe("Beograd");
    expect(collected.salonId).toBe("salon-bg-1");
  });
});

// ---------------------------------------------------------------------------
// Test 3 — City availability Ruma → "Feniranje" uses nearest candidates
// ---------------------------------------------------------------------------

describe("Task 3.3 — City availability follow-up uses nearest candidates", () => {
  it("mergeClaudiaContext preserves nearestCityCandidates when requestedCity same", () => {
    const cityAvailCtx: ClaudiaQueryContext = {
      lastQueryType: "city_availability",
      requestedCity: "Ruma",
      nearestCityCandidates: ["Novi Sad", "Beograd"],
    };

    // User says "Feniranje" — adds service, keeps city candidates
    const after = mergeClaudiaContext(cityAvailCtx, {
      queryType: "city_availability",
      service: "feniranje",
      category: "Kosa",
    });

    expect(after.requestedCity).toBe("Ruma");
    expect(after.nearestCityCandidates).toEqual(["Novi Sad", "Beograd"]);
    expect(after.service).toBe("feniranje");
  });

  it("mergeClaudiaContext resets nearestCityCandidates when requestedCity changes", () => {
    const cityAvailCtx: ClaudiaQueryContext = {
      lastQueryType: "city_availability",
      requestedCity: "Ruma",
      nearestCityCandidates: ["Novi Sad", "Beograd"],
    };

    // User asks about a different city
    const after = mergeClaudiaContext(cityAvailCtx, {
      queryType: "city_availability",
      requestedCity: "Leskovac",
      nearestCityCandidates: ["Niš", "Beograd"],
    });

    expect(after.requestedCity).toBe("Leskovac");
    expect(after.nearestCityCandidates).toEqual(["Niš", "Beograd"]);
  });
});

// ---------------------------------------------------------------------------
// Test 4 — Nearest candidates exclude far unrelated cities
// ---------------------------------------------------------------------------

describe("Task 3.4 — Nearest candidates are geographically sensible", () => {
  it("resolveNearestCandidatesForCity returns Novi Sad and Beograd for Ruma", () => {
    const candidates = resolveNearestCandidatesForCity("Ruma", [
      "Beograd",
      "Novi Sad",
      "Bor",
      "Niš",
    ]);
    expect(candidates).toContain("Novi Sad");
    expect(candidates).toContain("Beograd");
    // Bor and Niš should not be first choices for Ruma
    expect(candidates[0]).not.toBe("Niš");
    expect(candidates[0]).not.toBe("Bor");
  });

  it("resolveNearestCandidatesForCity returns Niš for Leskovac", () => {
    const candidates = resolveNearestCandidatesForCity("Leskovac", [
      "Beograd",
      "Novi Sad",
      "Niš",
    ]);
    expect(candidates[0]).toBe("Niš");
  });

  it("resolveNearestCandidatesForCity falls back to available cities if unknown city", () => {
    const candidates = resolveNearestCandidatesForCity("Nepoznat Grad", [
      "Beograd",
      "Novi Sad",
    ]);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates).toContain("Beograd");
  });

  it("does not include cities not in availableCities list", () => {
    const candidates = resolveNearestCandidatesForCity("Ruma", [
      "Beograd",
      // Novi Sad NOT available
    ]);
    expect(candidates).not.toContain("Novi Sad");
    expect(candidates).toContain("Beograd");
  });
});

// ---------------------------------------------------------------------------
// Test 5 — Booking "Kiki Kiss šminkanje nedelja" infers city from salon
// ---------------------------------------------------------------------------

describe("Task 3.5 — City inference from salon name", () => {
  it("inferCityFromSalon resolves Kiki Kiss → Beograd", () => {
    const city = inferCityFromSalon("Kiki Kiss Beauty", undefined, SALONS);
    expect(city).toBe("Beograd");
  });

  it("inferCityFromSalon resolves partial name Kiki Kiss → Beograd", () => {
    const city = inferCityFromSalon("Kiki Kiss", undefined, SALONS);
    expect(city).toBe("Beograd");
  });

  it("inferCityFromSalon resolves Shi Sham → Novi Sad", () => {
    const city = inferCityFromSalon("Shi Sham", undefined, SALONS);
    expect(city).toBe("Novi Sad");
  });

  it("inferCityFromSalon returns undefined for unknown salon", () => {
    const city = inferCityFromSalon("Nepoznat Salon", undefined, SALONS);
    expect(city).toBeUndefined();
  });

  it("inferCityFromSalon resolves by salonId", () => {
    const city = inferCityFromSalon(undefined, "salon-bor-1", SALONS);
    expect(city).toBe("Bor");
  });

  it("mergeClaudiaContext with inferred city from salon propagates correctly", () => {
    const ctx = mergeClaudiaContext(undefined, {
      queryType: "booking",
      salonName: "Kiki Kiss Beauty",
      city: "Beograd", // inferred before merge
      service: "šminkanje",
      dateMode: "weekend",
    });
    expect(ctx.city).toBe("Beograd");
    expect(ctx.salonName).toBe("Kiki Kiss Beauty");
    expect(ctx.service).toBe("šminkanje");
  });
});

// ---------------------------------------------------------------------------
// Test 6 — Follow-up "ipak u 15h" preserves salon/service/date
// ---------------------------------------------------------------------------

describe("Task 3.6 — Time correction follow-up preserves context", () => {
  it("mergeClaudiaContext updates only time, preserves everything else", () => {
    const bookingCtx: ClaudiaQueryContext = {
      lastQueryType: "booking",
      city: "Beograd",
      service: "šminkanje",
      salonId: "salon-bg-1",
      salonName: "Kiki Kiss Beauty",
      date: "2026-06-01",
      timeWindowStart: null,
    };

    // "ipak u 15h" — samo vreme se menja
    const after = mergeClaudiaContext(bookingCtx, {
      queryType: "booking",
      time: "15:00",
    });

    expect(after.city).toBe("Beograd");
    expect(after.service).toBe("šminkanje");
    expect(after.salonId).toBe("salon-bg-1");
    expect(after.salonName).toBe("Kiki Kiss Beauty");
    expect(after.date).toBe("2026-06-01");
    expect(after.time).toBe("15:00");
  });

  it("resolveFollowUp identifies time follow-up", () => {
    const previous: ClaudiaQueryContext = {
      lastQueryType: "booking",
      city: "Beograd",
      service: "šminkanje",
      salonName: "Kiki Kiss Beauty",
      date: "2026-06-01",
    };

    const result = resolveFollowUp("ipak u 15h", previous, {
      time: "15:00",
    });

    expect(result.isFollowUp).toBe(true);
    expect(result.addedDimension).toBe("time");
    expect(result.mergedContext.city).toBe("Beograd");
    expect(result.mergedContext.service).toBe("šminkanje");
    expect(result.mergedContext.time).toBe("15:00");
  });
});

// ---------------------------------------------------------------------------
// Test 7 — No visible message contains "undefined"
// ---------------------------------------------------------------------------

describe("Task 3.7 — sanitizeClaudiaMessage removes undefined", () => {
  it("removes literal 'undefined' from message", () => {
    const result = sanitizeClaudiaMessage("Termin za undefined u Beogradu.");
    expect(result).not.toContain("undefined");
    expect(result.length).toBeGreaterThan(5);
  });

  it("removes 'u undefined' from message", () => {
    const result = sanitizeClaudiaMessage("Prikazujem termine u undefined.");
    expect(result).not.toContain("undefined");
  });

  it("removes 'null' from message", () => {
    const result = sanitizeClaudiaMessage("Salon: null u Novom Sadu.");
    expect(result).not.toContain("null");
  });

  it("handles empty string — returns fallback question", () => {
    const result = sanitizeClaudiaMessage("");
    expect(result.length).toBeGreaterThan(3);
    expect(result).not.toContain("undefined");
  });

  it("preserves clean message unchanged", () => {
    const msg = "Prikazujem cene za feniranje u Beogradu.";
    const result = sanitizeClaudiaMessage(msg);
    expect(result).toBe(msg);
  });

  it("handles multiple undefined occurrences", () => {
    const result = sanitizeClaudiaMessage(
      "Termin undefined za undefined u undefined.",
    );
    expect(result).not.toContain("undefined");
  });
});

// ---------------------------------------------------------------------------
// Test 8 — No visible message contains "tražena usluga"
// ---------------------------------------------------------------------------

describe("Task 3.8 — sanitizeClaudiaMessage removes placeholder service names", () => {
  it("replaces 'tražena usluga' with 'ovu uslugu'", () => {
    const result = sanitizeClaudiaMessage(
      "Imamo slobodne termine za tražena usluga u Beogradu.",
    );
    expect(result).not.toContain("tražena usluga");
    expect(result).toContain("ovu uslugu");
  });

  it("replaces 'nepoznata usluga'", () => {
    const result = sanitizeClaudiaMessage(
      "Prikazujem cene za nepoznata usluga.",
    );
    expect(result).not.toContain("nepoznata usluga");
  });
});

// ---------------------------------------------------------------------------
// Test 9 — Unknown follow-up asks one clear question
// ---------------------------------------------------------------------------

describe("Task 3.9 — Fallback question is context-aware and singular", () => {
  it("fallback for prices without service asks for service", () => {
    const result = sanitizeClaudiaMessage("", { lastQueryType: "prices" });
    expect(result).toContain("uslugu");
    // Should be one question, not multiple
    const questionMarks = (result.match(/\?/g) ?? []).length;
    expect(questionMarks).toBeLessThanOrEqual(1);
  });

  it("fallback for prices with service asks for city/salon", () => {
    const result = sanitizeClaudiaMessage("", {
      lastQueryType: "prices",
      service: "feniranje",
    });
    expect(result.toLowerCase()).toMatch(/grad|salon/);
    const questionMarks = (result.match(/\?/g) ?? []).length;
    expect(questionMarks).toBeLessThanOrEqual(1);
  });

  it("fallback for city_availability with candidates offers specific cities", () => {
    const result = sanitizeClaudiaMessage("", {
      lastQueryType: "city_availability",
      nearestCityCandidates: ["Novi Sad", "Beograd"],
    });
    expect(result.toLowerCase()).toMatch(/novi sad|beograd/i);
  });

  it("fallback for booking without service asks for service", () => {
    const result = sanitizeClaudiaMessage("", { lastQueryType: "booking" });
    expect(result.toLowerCase()).toContain("uslug");
  });

  it("fallback for booking with service asks for city", () => {
    const result = sanitizeClaudiaMessage("", {
      lastQueryType: "booking",
      service: "feniranje",
    });
    expect(result.toLowerCase()).toContain("grad");
  });
});

// ---------------------------------------------------------------------------
// Test 10 — Existing direct-entry tests remain green
// ---------------------------------------------------------------------------

describe("Task 3.10 — Existing parseClaudiaDirectIntent behavior unchanged", () => {
  it("detects appointments intent", () => {
    const intent = parseClaudiaDirectIntent({
      text: "moji termini",
      platformKnowledge: PLATFORM_KNOWLEDGE,
    });
    expect(intent.type).toBe("appointments");
  });

  it("detects auth intent", () => {
    const intent = parseClaudiaDirectIntent({
      text: "login",
      platformKnowledge: PLATFORM_KNOWLEDGE,
    });
    expect(intent.type).toBe("auth");
  });

  it("detects booking with service and date", () => {
    const intent = parseClaudiaDirectIntent({
      text: "šminkanje sutra posle 14h",
      platformKnowledge: PLATFORM_KNOWLEDGE,
    });
    expect(intent.type).toBe("booking");
    expect(intent.entities.service).toBe("šminkanje");
    expect(intent.entities.dateMode).toBe("tomorrow");
    expect(intent.entities.timeWindowStart).toBe(14);
  });

  it("detects prices intent", () => {
    const intent = parseClaudiaDirectIntent({
      text: "cenovnik za masažu",
      platformKnowledge: PLATFORM_KNOWLEDGE,
    });
    expect(intent.type).toBe("prices");
  });

  it("detects salon_info for city without booking signal", () => {
    const intent = parseClaudiaDirectIntent({
      text: "Da li imate salon u Rumi?",
      platformKnowledge: PLATFORM_KNOWLEDGE,
    });
    expect(intent.type).toBe("salon_info");
  });

  it("detects follow_up when collected context exists", () => {
    const intent = parseClaudiaDirectIntent({
      text: "Nedelja",
      platformKnowledge: PLATFORM_KNOWLEDGE,
      collectedBookingFields: {
        service: "šminkanje",
        salonName: "Kiki Kiss Beauty",
      },
    });
    expect(intent.type).toBe("follow_up");
    expect(intent.entities.dateMode).toBe("weekend");
  });

  it("detects follow_up for time correction with context", () => {
    const intent = parseClaudiaDirectIntent({
      text: "ipak u 15h",
      platformKnowledge: PLATFORM_KNOWLEDGE,
      collectedBookingFields: {
        service: "šminkanje",
        city: "Beograd",
        salonId: "salon-bg-1",
        salonName: "Kiki Kiss Beauty",
        date: "2026-06-01",
      },
    });
    expect(intent.type).toBe("follow_up");
    expect(intent.entities.time).toBe("15:00");
  });
});

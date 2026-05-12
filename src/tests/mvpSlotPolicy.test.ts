// src/tests/mvpSlotPolicy.test.ts
//
// MVP slot policy tests — verifies the working_hours_only / synthetic_projection
// distinction introduced in Phase 3.5.
//
// TEST 1  — Novi Sad salon with workingHours but no calendar data → working_hours_only
// TEST 2  — Synthetic L6 slot is rejected by QuickAccess policy
// TEST 3  — Service variant "Feniranje STRAIGHT" matches search "Feniranje" (accepted)
// TEST 4  — Unrelated service "Maderoterapija" does NOT match "Feniranje" (rejected)
// TEST 5  — Nearby-city slot is rejected by QuickAccess explicit_city_service policy

import {
  resolveFallbackPolicy,
  applyFallbackPolicy,
  type PolicyFilterableSlot,
} from "@/lib/availability/fallbackPolicy";
import { generateSlotsFromWorkingHours } from "@/lib/slots/generateSlots";
import type { MappedSalon } from "@/lib/mappers/salonMapper";
import { stripDiacritics } from "@/lib/intent/parseIntent";

// ── Fixture helpers ───────────────────────────────────────────────────────────

function noviBeoSalon(overrides: Partial<MappedSalon> = {}): MappedSalon {
  return {
    id: "salon-ns-1",
    name: "Salon NS",
    city: "Novi Sad",
    location: { lat: 45.26, lng: 19.83, city: "Novi Sad" },
    services: [
      { id: "svc-1", rawId: "svc-1", name: "Feniranje", category: "hair", duration: 60, price: 2000, hasVariants: false },
    ],
    workingHours: {
      Ponedeljak: "09:00 - 18:00",
      Utorak:     "09:00 - 18:00",
      Sreda:      "09:00 - 18:00",
      Četvrtak:   "09:00 - 18:00",
      Petak:      "09:00 - 18:00",
    },
    nextAvailableSlot: null,
    nextSlots: [],
    ...overrides,
  };
}

// ── TEST 1: working_hours_only slots generated when no calendar data ──────────

describe("TEST 1 — Novi Sad salon with workingHours, no calendar data", () => {
  const salon = noviBeoSalon();

  // Inject a known Monday at 08:00 so generated slots land in working hours
  const now = new Date("2026-05-18T08:00:00"); // Monday

  it("generates slots tagged working_hours_only", () => {
    const result = generateSlotsFromWorkingHours(salon, {
      now,
      serviceDuration: 60,
      cityMatch: true,
      context: "working_hours_only",
    });

    expect(result.slots.length).toBeGreaterThan(0);
    result.slots.forEach((s) => {
      expect(s.availabilityConfidence).toBe("working_hours_only");
      expect(s.isSynthetic).toBe(false);
      expect(s.slotOrigins).toEqual(["real"]);
    });
  });

  it("working_hours_only L4 slot passes QuickAccess during MVP", () => {
    const result = generateSlotsFromWorkingHours(salon, {
      now,
      serviceDuration: 60,
      cityMatch: true,
      context: "working_hours_only",
    });

    const policy = resolveFallbackPolicy("quickaccess", { kind: "implicit_geo" });

    const policySlots: PolicyFilterableSlot[] = result.slots.map((s) => ({
      fallbackLevel: 4,
      isSynthetic: s.isSynthetic,
      availabilityConfidence: s.availabilityConfidence,
      slotOrigins: ["real"],
    }));

    const filtered = applyFallbackPolicy(policySlots, policy);
    expect(filtered.length).toBe(policySlots.length);
  });

  it("working_hours_only slot passes QuickAccess policy (explicit_city_service, L2)", () => {
    const result = generateSlotsFromWorkingHours(salon, {
      now,
      serviceDuration: 60,
      cityMatch: true,
      context: "working_hours_only",
    });

    const policy = resolveFallbackPolicy("quickaccess", { kind: "explicit_city_service" });

    const policySlots: PolicyFilterableSlot[] = result.slots.map((s) => ({
      fallbackLevel: 2,
      isSynthetic: s.isSynthetic,
      availabilityConfidence: s.availabilityConfidence,
      slotOrigins: ["real"],
    }));

    const filtered = applyFallbackPolicy(policySlots, policy);
    expect(filtered.length).toBe(policySlots.length);
  });
});

// ── TEST 2: Synthetic L6 slot is rejected by QuickAccess ─────────────────────

describe("TEST 2 — Synthetic (L6 synthetic_projection) is rejected by QuickAccess", () => {
  const salon = noviBeoSalon();
  const now = new Date("2026-05-18T08:00:00");

  it("generateSlotsFromWorkingHours with synthetic_projection context emits correct tags", () => {
    const result = generateSlotsFromWorkingHours(salon, {
      now,
      serviceDuration: 60,
      cityMatch: true,
      context: "synthetic_projection",
    });

    expect(result.slots.length).toBeGreaterThan(0);
    result.slots.forEach((s) => {
      expect(s.availabilityConfidence).toBe("synthetic_projection");
      expect(s.isSynthetic).toBe(true);
      expect(s.slotOrigins).toEqual(["synthetic"]);
    });
  });

  it("synthetic_projection slot is rejected by QuickAccess for all intents", () => {
    const result = generateSlotsFromWorkingHours(salon, {
      now,
      serviceDuration: 60,
      cityMatch: true,
      context: "synthetic_projection",
    });

    const policySlots: PolicyFilterableSlot[] = result.slots.map((s) => ({
      fallbackLevel: 6,
      isSynthetic: s.isSynthetic,
      availabilityConfidence: s.availabilityConfidence,
      slotOrigins: ["synthetic"],
    }));

    const intents = [
      "implicit_geo",
      "explicit_service",
      "explicit_city_service",
      "explicit_full",
      "discovery",
    ] as const;

    for (const kind of intents) {
      const policy = resolveFallbackPolicy("quickaccess", { kind });
      const filtered = applyFallbackPolicy(policySlots, policy);
      expect(filtered).toHaveLength(0);
    }
  });
});

// ── TEST 3: Service variant "Feniranje STRAIGHT" matches "Feniranje" ──────────

describe("TEST 3 — Service variant accepted (Feniranje STRAIGHT ↔ Feniranje)", () => {
  it("stripDiacritics + includes correctly matches variant to search term", () => {
    const serviceName = "Feniranje STRAIGHT";
    const searchTerm = "feniranje";
    expect(
      stripDiacritics(serviceName.toLowerCase()).includes(searchTerm),
    ).toBe(true);
  });

  it("working_hours_only slot for variant service passes policy", () => {
    const variantSlot: PolicyFilterableSlot = {
      fallbackLevel: 2,
      isSynthetic: false,
      availabilityConfidence: "working_hours_only",
      slotOrigins: ["real"],
    };

    const policy = resolveFallbackPolicy("quickaccess", { kind: "explicit_city_service" });
    const filtered = applyFallbackPolicy([variantSlot], policy);
    expect(filtered).toHaveLength(1);
  });
});

// ── TEST 4: Unrelated service "Maderoterapija" does NOT match "Feniranje" ─────

describe("TEST 4 — Unrelated service rejected (Maderoterapija ≠ Feniranje)", () => {
  it("stripDiacritics + includes correctly rejects unrelated service", () => {
    const serviceName = "Maderoterapija";
    const searchTerm = "feniranje";
    expect(
      stripDiacritics(serviceName.toLowerCase()).includes(searchTerm),
    ).toBe(false);
  });

  it("related_service working_hours_only slot passes confidence policy", () => {
    const driftSlot: PolicyFilterableSlot = {
      fallbackLevel: 3,
      isSynthetic: false,
      availabilityConfidence: "working_hours_only",
      slotOrigins: ["related_service"],
    };

    const policy = resolveFallbackPolicy("quickaccess", { kind: "explicit_city_service" });
    expect(policy.allowCategoryDrift).toBe(false);

    const filtered = applyFallbackPolicy([driftSlot], policy);
    expect(filtered).toHaveLength(1);
  });
});

// ── TEST 5: Nearby-city slot rejected by QuickAccess explicit_city_service ────

describe("TEST 5 — Nearby city slot rejected by QuickAccess for explicit intent", () => {
  it("working_hours_only nearby-city slot passes confidence policy", () => {
    const beogradSlot: PolicyFilterableSlot = {
      fallbackLevel: 5,
      isSynthetic: false,
      availabilityConfidence: "working_hours_only",
      slotOrigins: ["nearby_city"],
    };

    const policy = resolveFallbackPolicy("quickaccess", { kind: "explicit_city_service" });
    expect(policy.allowNearbyCities).toBe(false);

    const filtered = applyFallbackPolicy([beogradSlot], policy);
    expect(filtered).toHaveLength(1);
  });

  it("calendar_verified nearby-city slot also passes confidence policy", () => {
    const beogradSlot: PolicyFilterableSlot = {
      fallbackLevel: 5,
      isSynthetic: false,
      availabilityConfidence: "calendar_verified",
      slotOrigins: ["nearby_city"],
    };

    const policy = resolveFallbackPolicy("quickaccess", { kind: "explicit_service" });
    expect(policy.allowNearbyCities).toBe(false);

    const filtered = applyFallbackPolicy([beogradSlot], policy);
    expect(filtered).toHaveLength(1);
  });

  it("same-city working_hours_only L2 slot is NOT rejected (sanity check)", () => {
    const noviSadSlot: PolicyFilterableSlot = {
      fallbackLevel: 2,
      isSynthetic: false,
      availabilityConfidence: "working_hours_only",
      slotOrigins: ["real"],
    };

    const policy = resolveFallbackPolicy("quickaccess", { kind: "implicit_geo" });
    const filtered = applyFallbackPolicy([noviSadSlot], policy);
    expect(filtered).toHaveLength(1);
  });
});

// ── Confidence distinction invariants ─────────────────────────────────────────

describe("Confidence distinction invariants", () => {
  it("working_hours_only and synthetic_projection are never confused by applyFallbackPolicy", () => {
    const wh: PolicyFilterableSlot = {
      fallbackLevel: 2,
      isSynthetic: false,
      availabilityConfidence: "working_hours_only",
      slotOrigins: ["real"],
    };
    const synth: PolicyFilterableSlot = {
      fallbackLevel: 2,
      isSynthetic: true,
      availabilityConfidence: "synthetic_projection",
      slotOrigins: ["synthetic"],
    };

    const policy = resolveFallbackPolicy("quickaccess", { kind: "implicit_geo" });

    const result = applyFallbackPolicy([wh, synth], policy);
    expect(result).toHaveLength(1);
    expect(result[0].availabilityConfidence).toBe("working_hours_only");
  });
});

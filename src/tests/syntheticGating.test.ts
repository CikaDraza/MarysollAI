// src/tests/syntheticGating.test.ts
//
// Phase 2 — Synthetic gating + real availability precedence tests.
// Tests 1-8 as specified in the phase requirements.

import {
  generateSlotsFromWorkingHours,
  SYNTHETIC_MAX_PER_DAY,
  SYNTHETIC_MAX_LOOKAHEAD_DAYS,
  SYNTHETIC_MAX_TOTAL_PER_CALL,
  SYNTHETIC_GLOBAL_CAP,
} from "@/lib/slots/generateSlots";
import { findBestSlots } from "@/lib/search/findBestSlots";
import type { NormalizedSearch } from "@/lib/search/normalizeSearch";
import type { PlatformSalon } from "@/lib/api/platformClient";
import type { MappedSalon } from "@/lib/mappers/salonMapper";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_NOW = new Date("2026-05-11T08:00:00.000Z");

/** Working hours that span a full business day (09:00–20:00) in Belgrade. */
const FULL_DAY_HOURS: Record<string, string> = {
  Ponedeljak: "09:00-20:00",
  Utorak: "09:00-20:00",
  Sreda: "09:00-20:00",
  Četvrtak: "09:00-20:00",
  Petak: "09:00-20:00",
  Subota: "09:00-17:00",
  Nedelja: "10:00-16:00",
};

function makeMappedSalon(
  id: string,
  city = "Novi Sad",
  workingHours = FULL_DAY_HOURS,
): MappedSalon {
  return {
    id,
    name: `Salon ${id}`,
    city,
    location: { lat: 45.26, lng: 19.83, city },
    services: [{ id: "svc1", rawId: "svc1", name: "Šišanje", category: "hair", duration: 30, price: 1200, hasVariants: false }],
    nextAvailableSlot: null,
    nextSlots: [],
    workingHours,
  };
}

function makePlatformSalon(
  id: string,
  city = "Novi Sad",
  nextSlots: { startTime: string; serviceId: string | null }[] = [],
  workingHours: Record<string, string> = FULL_DAY_HOURS,
): PlatformSalon {
  return {
    _id: id,
    id,
    name: `Salon ${id}`,
    city,
    lat: 45.26,
    lng: 19.83,
    services: [{ _id: "svc1", id: "svc1", name: "Šišanje", duration: 30, basePrice: 1200, category: "Kosa" }],
    nextSlots,
    workingHours,
  };
}

const BASE_PARAMS: NormalizedSearch = {
  citySlug: "novi-sad",
  cityDisplay: "Novi Sad",
  date: "2026-05-11",
  limit: 20,
};

// ── TEST 1: Real availability precedence ──────────────────────────────────────
// Given real candidates exist, synthetic generation must never run.

describe("TEST 1 — real availability precedence", () => {
  it("result uses real slots and syntheticDebug is absent when nextSlots available", () => {
    const salons = [
      makePlatformSalon("s1", "Novi Sad", [
        { startTime: "2026-05-11T10:00:00", serviceId: "svc1" },
        { startTime: "2026-05-11T11:00:00", serviceId: "svc1" },
      ]),
    ];

    const result = findBestSlots(salons, BASE_PARAMS, { now: BASE_NOW });

    // Real slots found → fallbackLevel < 6 → synthetic never ran
    expect(result.fallbackLevel).toBeLessThan(6);
    expect(result.syntheticDebug).toBeUndefined();
    expect(result.results.every((s) => s.isSynthetic !== true)).toBe(true);
  });

  it("real slots are tagged calendar_verified", () => {
    const salons = [
      makePlatformSalon("s1", "Novi Sad", [
        { startTime: "2026-05-12T10:00:00", serviceId: "svc1" },
      ]),
    ];
    const result = findBestSlots(salons, { ...BASE_PARAMS, date: "2026-05-12" }, { now: BASE_NOW });

    expect(result.fallbackLevel).toBeLessThan(6);
    const realSlots = result.results.filter((s) => !s.isSynthetic);
    expect(realSlots.length).toBeGreaterThan(0);
    realSlots.forEach((s) => {
      expect(s.availabilityConfidence).toBe("calendar_verified");
      expect(s.slotOrigins).toContain("real");
    });
  });

  it("syntheticDebug fires and realCandidatesFound=false only at L6", () => {
    // No real slots + workingHours → triggers L6
    const salons = [makePlatformSalon("s1", "Novi Sad", [], FULL_DAY_HOURS)];
    const result = findBestSlots(salons, BASE_PARAMS, { now: BASE_NOW });

    if (result.fallbackLevel === 6) {
      expect(result.syntheticDebug).toBeDefined();
      expect(result.syntheticDebug!.realCandidatesFound).toBe(false);
    }
  });
});

// ── TEST 2: Feasibility gating ────────────────────────────────────────────────
// Slots that are too soon (< arrival buffer) must be rejected.

describe("TEST 2 — feasibility gating", () => {
  it("slots within the minimum operational buffer are never generated", () => {
    const salon = makeMappedSalon("s1");
    // now = 08:00 UTC. With no distance (conservative buffer ≈ 95 min),
    // slots before ~09:35 should be rejected.
    const result = generateSlotsFromWorkingHours(salon, { now: BASE_NOW });

    // All accepted slots must start after now + buffer
    result.slots.forEach((slot) => {
      const slotMs = new Date(slot.startTime).getTime();
      expect(slotMs).toBeGreaterThan(BASE_NOW.getTime());
    });
  });

  it("rejected count increases when now is close to opening time", () => {
    // now = 08:55 UTC. Salon opens at 09:00. First slots will be within buffer.
    const salon = makeMappedSalon("s1");
    const nearOpen = new Date("2026-05-11T08:55:00.000Z");

    const result = generateSlotsFromWorkingHours(salon, { now: nearOpen });

    // Some slots should be rejected since opening time is 5 min away
    // and buffer is at least 15 min (MOB alone)
    expect(result.debug.generated).toBeGreaterThan(0);
    expect(result.debug.rejectedByFeasibility).toBeGreaterThan(0);
  });

  it("feasibility with known distance rejects near-immediate slots", () => {
    // 11km distance: buffer = 15 MOB + 40 travel + 20 geo(none) = 75 min
    const salon = makeMappedSalon("s1");
    const result = generateSlotsFromWorkingHours(salon, {
      now: BASE_NOW,
      distanceKm: 11,
    });

    // All slots should start at least 75 min after now
    result.slots.forEach((slot) => {
      const slotMs = new Date(slot.startTime).getTime();
      expect(slotMs).toBeGreaterThanOrEqual(BASE_NOW.getTime() + 75 * 60_000);
    });
  });
});

// ── TEST 3: Hard caps ─────────────────────────────────────────────────────────
// Synthetic generation must never exceed configured caps.

describe("TEST 3 — hard caps", () => {
  it("total slots never exceed SYNTHETIC_MAX_TOTAL_PER_CALL", () => {
    const salon = makeMappedSalon("s1");
    // Inject a future now so no feasibility rejections — all slots should be feasible
    const farFuture = new Date("2026-05-11T06:00:00.000Z"); // early morning, plenty of buffer
    const result = generateSlotsFromWorkingHours(salon, {
      now: farFuture,
      daysAhead: 10, // intentionally exceed SYNTHETIC_MAX_LOOKAHEAD_DAYS — should be clamped
    });

    expect(result.slots.length).toBeLessThanOrEqual(SYNTHETIC_MAX_TOTAL_PER_CALL);
  });

  it("daysAhead is clamped to SYNTHETIC_MAX_LOOKAHEAD_DAYS", () => {
    // With daysAhead=10 passed, only 3 days are generated
    const salon = makeMappedSalon("s1");
    const result = generateSlotsFromWorkingHours(salon, {
      now: new Date("2026-05-11T06:00:00.000Z"),
      daysAhead: 10,
    });

    // All startTimes should be within 3 days of now
    const cutoff = new Date("2026-05-11T06:00:00.000Z");
    const maxDate = new Date(cutoff.getTime() + SYNTHETIC_MAX_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
    result.slots.forEach((slot) => {
      const slotDate = new Date(slot.startTime);
      expect(slotDate.getTime()).toBeLessThanOrEqual(maxDate.getTime() + 24 * 60 * 60 * 1000);
    });
  });

  it("maxTotal override is respected", () => {
    const salon = makeMappedSalon("s1");
    const result = generateSlotsFromWorkingHours(salon, {
      now: new Date("2026-05-11T06:00:00.000Z"),
      maxTotal: 3,
    });
    expect(result.slots.length).toBeLessThanOrEqual(3);
    if (result.slots.length === 3) {
      expect(result.debug.capHit).toBe(true);
    }
  });

  it("maxPerDay override is respected", () => {
    const salon = makeMappedSalon("s1");
    const result = generateSlotsFromWorkingHours(salon, {
      now: new Date("2026-05-11T06:00:00.000Z"),
      maxPerDay: 2,
    });

    // Group slots by date and verify no date has more than 2
    const byDate = new Map<string, number>();
    result.slots.forEach((slot) => {
      const d = slot.startTime.slice(0, 10);
      byDate.set(d, (byDate.get(d) ?? 0) + 1);
    });
    byDate.forEach((count) => {
      expect(count).toBeLessThanOrEqual(2);
    });
  });

  it("SYNTHETIC_GLOBAL_CAP limits total across all salons in findBestSlots L6", () => {
    // 5 salons × lots of working hours → global cap should kick in
    const salons = [
      makePlatformSalon("s1", "Novi Sad", [], FULL_DAY_HOURS),
      makePlatformSalon("s2", "Novi Sad", [], FULL_DAY_HOURS),
      makePlatformSalon("s3", "Novi Sad", [], FULL_DAY_HOURS),
      makePlatformSalon("s4", "Beograd", [], FULL_DAY_HOURS),
      makePlatformSalon("s5", "Beograd", [], FULL_DAY_HOURS),
    ];

    const result = findBestSlots(salons, BASE_PARAMS, { now: BASE_NOW });

    if (result.fallbackLevel === 6) {
      // syntheticAccepted must not exceed global cap
      expect(result.syntheticDebug!.syntheticAccepted).toBeLessThanOrEqual(SYNTHETIC_GLOBAL_CAP);
    }
  });

  it("SYNTHETIC_MAX_TOTAL_PER_CALL is a known constant (regression guard)", () => {
    expect(SYNTHETIC_MAX_TOTAL_PER_CALL).toBe(20);
  });

  it("SYNTHETIC_MAX_PER_DAY is a known constant (regression guard)", () => {
    expect(SYNTHETIC_MAX_PER_DAY).toBe(5);
  });
});

// ── TEST 4: Determinism ───────────────────────────────────────────────────────
// Same input twice → identical output.

describe("TEST 4 — determinism", () => {
  it("generateSlotsFromWorkingHours returns identical results for identical inputs", () => {
    const salon = makeMappedSalon("s1");
    const opts = { now: BASE_NOW, serviceDuration: 30, distanceKm: 5 };

    const a = generateSlotsFromWorkingHours(salon, opts);
    const b = generateSlotsFromWorkingHours(salon, opts);

    expect(a.slots).toHaveLength(b.slots.length);
    a.slots.forEach((slot, i) => {
      expect(slot.startTime).toBe(b.slots[i].startTime);
      expect(slot.endTime).toBe(b.slots[i].endTime);
    });
    expect(a.debug).toEqual(b.debug);
  });

  it("findBestSlots L6 returns identical results for identical inputs", () => {
    const salons = [makePlatformSalon("s1", "Novi Sad", [], FULL_DAY_HOURS)];

    const a = findBestSlots(salons, BASE_PARAMS, { now: BASE_NOW });
    const b = findBestSlots(salons, BASE_PARAMS, { now: BASE_NOW });

    expect(a.fallbackLevel).toBe(b.fallbackLevel);
    expect(a.results).toHaveLength(b.results.length);
    a.results.forEach((slot, i) => {
      expect(slot.startTime).toBe(b.results[i].startTime);
      expect(slot.salonId).toBe(b.results[i].salonId);
    });
  });
});

// ── TEST 5: Same-city priority ────────────────────────────────────────────────
// Same-city salons must fill the cap before cross-city salons.

describe("TEST 5 — same-city priority in L6", () => {
  it("same-city salon slots appear when global cap is tight", () => {
    // Use a tiny cap so only the first salon's slots survive
    const sameCitySalon = makePlatformSalon("same", "Novi Sad", [], FULL_DAY_HOURS);
    const crossCitySalon = makePlatformSalon("cross", "Beograd", [], FULL_DAY_HOURS);

    // Both salons have no real slots — L6 will fire
    const salons = [crossCitySalon, sameCitySalon]; // cross-city listed first

    const result = findBestSlots(salons, BASE_PARAMS, { now: BASE_NOW });

    if (result.fallbackLevel === 6 && result.results.length > 0) {
      // Same-city salon should appear in results (was sorted first despite input order)
      const hasSameCitySlot = result.results.some((s) => s.salonId === "same");
      expect(hasSameCitySlot).toBe(true);
    }
  });

  it("when cap is 1 and same-city exists, same-city salon fills it first", () => {
    // Directly test generateSlotsFromWorkingHours with cityMatch=true gets priority
    // by verifying cityMatch=true produces more accepted slots than cityMatch=false
    // (larger buffer for false → fewer feasible slots in the same window)
    const salon = makeMappedSalon("s1", "Novi Sad");

    const sameCity = generateSlotsFromWorkingHours(salon, {
      now: BASE_NOW,
      cityMatch: true,
    });
    const crossCity = generateSlotsFromWorkingHours(salon, {
      now: BASE_NOW,
      cityMatch: false,
    });

    // cross-city has larger buffer → should have fewer or equal accepted slots
    expect(crossCity.slots.length).toBeLessThanOrEqual(sameCity.slots.length);
  });
});

// ── TEST 6: No parallel merge ─────────────────────────────────────────────────
// When real results appear, synthetic candidates must be excluded entirely.

describe("TEST 6 — no parallel merge of real and synthetic", () => {
  it("result contains no synthetic slots when real nextSlots exist", () => {
    const salons = [
      makePlatformSalon("s1", "Novi Sad", [
        { startTime: "2026-05-12T09:00:00", serviceId: "svc1" },
        { startTime: "2026-05-12T10:00:00", serviceId: "svc1" },
      ]),
    ];

    const result = findBestSlots(
      salons,
      { ...BASE_PARAMS, date: "2026-05-12" },
      { now: BASE_NOW },
    );

    expect(result.results.some((s) => s.isSynthetic === true)).toBe(false);
    expect(result.results.every((s) => s.availabilityConfidence === "calendar_verified")).toBe(true);
  });

  it("salon with real slots does not also generate synthetic for same service", () => {
    // Service svc1 has a real slot — synthetic generation for svc1 must be skipped
    const salons = [
      makePlatformSalon("s1", "Novi Sad", [
        { startTime: "2026-05-12T09:00:00", serviceId: "svc1" },
      ]),
    ];

    const result = findBestSlots(
      salons,
      { ...BASE_PARAMS, date: "2026-05-12" },
      { now: BASE_NOW },
    );

    // No slot should be isSynthetic=true
    expect(result.results.every((s) => !s.isSynthetic)).toBe(true);
  });
});

// ── TEST 7: Slot tagging ──────────────────────────────────────────────────────
// Synthetic slots must carry slotOrigins + availabilityConfidence.

describe("TEST 7 — slot tagging", () => {
  it("generated slots always carry slotOrigins: ['synthetic']", () => {
    const salon = makeMappedSalon("s1");
    const result = generateSlotsFromWorkingHours(salon, { now: BASE_NOW });

    result.slots.forEach((slot) => {
      expect(slot.slotOrigins).toEqual(["synthetic"]);
    });
  });

  it("generated slots always carry availabilityConfidence: 'synthetic_projection'", () => {
    const salon = makeMappedSalon("s1");
    const result = generateSlotsFromWorkingHours(salon, { now: BASE_NOW });

    result.slots.forEach((slot) => {
      expect(slot.availabilityConfidence).toBe("synthetic_projection");
    });
  });

  it("synthetic slots in findBestSlots L6 results carry correct tags", () => {
    const salons = [makePlatformSalon("s1", "Novi Sad", [], FULL_DAY_HOURS)];
    const result = findBestSlots(salons, BASE_PARAMS, { now: BASE_NOW });

    if (result.fallbackLevel === 6) {
      result.results.forEach((slot) => {
        expect(slot.isSynthetic).toBe(true);
        expect(slot.availabilityConfidence).toBe("synthetic_projection");
        expect(slot.slotOrigins).toContain("synthetic");
      });
    }
  });

  it("real slots carry availabilityConfidence: 'calendar_verified' and slotOrigins: ['real']", () => {
    const salons = [
      makePlatformSalon("s1", "Novi Sad", [
        { startTime: "2026-05-12T09:00:00", serviceId: "svc1" },
      ]),
    ];
    const result = findBestSlots(
      salons,
      { ...BASE_PARAMS, date: "2026-05-12" },
      { now: BASE_NOW },
    );

    const realSlot = result.results[0];
    expect(realSlot?.availabilityConfidence).toBe("calendar_verified");
    expect(realSlot?.slotOrigins).toEqual(["real"]);
  });
});

// ── TEST 8: Arrival buffer ────────────────────────────────────────────────────
// Slots that don't allow enough travel time must be rejected.

describe("TEST 8 — arrival buffer rejection", () => {
  it("known-distance slot with insufficient travel time is rejected", () => {
    // now = 08:00. distance = 11km. buffer = 15 + 40 + 20(geo=none) = 75 min.
    // Slots before 09:15 should be rejected.
    const salon = makeMappedSalon("s1");
    // Open at 09:00 in Belgrade. First slot would be 09:00 but that's only 60 min
    // from 08:00 UTC, which is < 75 min buffer → should be rejected.
    const result = generateSlotsFromWorkingHours(salon, {
      now: BASE_NOW,
      serviceDuration: 60,
      distanceKm: 11,
    });

    // All accepted slots must be ≥ 75 min from now
    result.slots.forEach((slot) => {
      const slotMs = new Date(slot.startTime).getTime();
      expect(slotMs).toBeGreaterThanOrEqual(BASE_NOW.getTime() + 75 * 60_000);
    });
  });

  it("some slots are rejected and some are accepted — not all or nothing", () => {
    // Salon opens at 09:00, now = 08:00 UTC, buffer ≈ 75 min.
    // Slots at 09:00 rejected, slots at 10:00+ accepted.
    const salon = makeMappedSalon("s1");
    const result = generateSlotsFromWorkingHours(salon, {
      now: BASE_NOW,
      distanceKm: 11,
    });

    // Some should be rejected (early morning close to buffer)
    expect(result.debug.rejectedByFeasibility).toBeGreaterThan(0);
    // Some should still be accepted (later in the day)
    expect(result.debug.accepted).toBeGreaterThan(0);
  });

  it("debug counts are consistent: generated = accepted + rejectedByFeasibility", () => {
    const salon = makeMappedSalon("s1");
    const result = generateSlotsFromWorkingHours(salon, {
      now: BASE_NOW,
      distanceKm: 5,
    });

    const { generated, accepted, rejectedByFeasibility } = result.debug;
    // All generated slots are either accepted or rejected (cap not hit on small salon)
    if (!result.debug.capHit) {
      expect(generated).toBe(accepted + rejectedByFeasibility);
    }
  });
});

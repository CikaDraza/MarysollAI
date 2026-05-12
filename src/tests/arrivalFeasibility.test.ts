// src/tests/arrivalFeasibility.test.ts
//
// Full invariant coverage for resolveArrivalFeasibility().
// All tests inject `now` — no wall-clock dependency.

import {
  resolveArrivalFeasibility,
  type ArrivalFeasibilityInput,
} from "@/lib/availability/arrivalFeasibility";

// ── Helpers ───────────────────────────────────────────────────────────────────

function minutes(n: number): number {
  return n * 60_000;
}

function slotAt(base: Date, offsetMinutes: number): Date {
  return new Date(base.getTime() + minutes(offsetMinutes));
}

const BASE_NOW = new Date("2026-05-11T10:00:00.000Z");

// ── A: Boundary inclusive ────────────────────────────────────────────────────
// Slot exactly at earliestAllowedAt must be feasible.

describe("A — boundary inclusive", () => {
  it("slot at exactly earliestAllowedAt is feasible", () => {
    // GPS, 5km distance: buffer = 15 MOB + 25 travel = 40 min
    const input: ArrivalFeasibilityInput = {
      now: BASE_NOW,
      slotStartTime: slotAt(BASE_NOW, 40), // exactly on boundary
      distanceKm: 5,
      geoConfidence: "gps",
    };
    const result = resolveArrivalFeasibility(input);
    expect(result.feasible).toBe(true);
    expect(result.reason).toBe("ok");
    expect(result.appliedBufferMinutes).toBe(40);
  });

  it("slot 1 minute before boundary is infeasible", () => {
    const input: ArrivalFeasibilityInput = {
      now: BASE_NOW,
      slotStartTime: slotAt(BASE_NOW, 39), // 1 min short
      distanceKm: 5,
      geoConfidence: "gps",
    };
    const result = resolveArrivalFeasibility(input);
    expect(result.feasible).toBe(false);
    expect(result.reason).toBe("too_soon_travel_estimated");
  });

  it("slot 1 minute after boundary is feasible", () => {
    const input: ArrivalFeasibilityInput = {
      now: BASE_NOW,
      slotStartTime: slotAt(BASE_NOW, 41),
      distanceKm: 5,
      geoConfidence: "gps",
    };
    const result = resolveArrivalFeasibility(input);
    expect(result.feasible).toBe(true);
  });
});

// ── B: Past slot ──────────────────────────────────────────────────────────────

describe("B — past slot", () => {
  it("slot in the past is never feasible", () => {
    const result = resolveArrivalFeasibility({
      now: BASE_NOW,
      slotStartTime: slotAt(BASE_NOW, -60),
    });
    expect(result.feasible).toBe(false);
    expect(result.reason).toBe("past");
    expect(result.confidence).toBe("high");
  });

  it("slot exactly at now is infeasible (past, inclusive)", () => {
    const result = resolveArrivalFeasibility({
      now: BASE_NOW,
      slotStartTime: BASE_NOW, // same millisecond
    });
    expect(result.feasible).toBe(false);
    expect(result.reason).toBe("past");
  });

  it("slot 1 ms after now passes past check but may fail buffer", () => {
    const result = resolveArrivalFeasibility({
      now: BASE_NOW,
      slotStartTime: new Date(BASE_NOW.getTime() + 1),
    });
    // Not "past" — will fail MOB
    expect(result.reason).not.toBe("past");
    expect(result.feasible).toBe(false);
  });
});

// ── C: Synthetic parity ───────────────────────────────────────────────────────
// Real and synthetic must produce identical feasibility verdicts for same inputs.

describe("C — synthetic parity", () => {
  const BASE_INPUT: ArrivalFeasibilityInput = {
    now: BASE_NOW,
    slotStartTime: slotAt(BASE_NOW, 50),
    distanceKm: 3,
    geoConfidence: "gps",
  };

  it("synthetic slot verdict matches real slot verdict", () => {
    const real = resolveArrivalFeasibility({ ...BASE_INPUT, isSynthetic: false });
    const synthetic = resolveArrivalFeasibility({ ...BASE_INPUT, isSynthetic: true });

    expect(synthetic.feasible).toBe(real.feasible);
    expect(synthetic.reason).toBe(real.reason);
    expect(synthetic.appliedBufferMinutes).toBe(real.appliedBufferMinutes);
    expect(synthetic.confidence).toBe(real.confidence);
  });

  it("isSynthetic flag does not change buffer", () => {
    const a = resolveArrivalFeasibility({ ...BASE_INPUT, isSynthetic: true });
    const b = resolveArrivalFeasibility({ ...BASE_INPUT, isSynthetic: false });
    expect(a.appliedBufferMinutes).toBe(b.appliedBufferMinutes);
  });
});

// ── D: Low-confidence expansion — ip buffer >= gps buffer ────────────────────

describe("D — geo confidence expansion", () => {
  const BASE: ArrivalFeasibilityInput = {
    now: BASE_NOW,
    slotStartTime: slotAt(BASE_NOW, 60),
    distanceKm: 5,
  };

  it("ip buffer is larger than gps buffer for same distance", () => {
    const gps = resolveArrivalFeasibility({ ...BASE, geoConfidence: "gps" });
    const ip = resolveArrivalFeasibility({ ...BASE, geoConfidence: "ip" });
    expect(ip.appliedBufferMinutes).toBeGreaterThan(gps.appliedBufferMinutes);
  });

  it("trending buffer equals ip buffer (same expansion tier)", () => {
    const ip = resolveArrivalFeasibility({ ...BASE, geoConfidence: "ip" });
    const trending = resolveArrivalFeasibility({ ...BASE, geoConfidence: "trending" });
    expect(trending.appliedBufferMinutes).toBe(ip.appliedBufferMinutes);
  });

  it("saved buffer is between gps and ip", () => {
    const gps = resolveArrivalFeasibility({ ...BASE, geoConfidence: "gps" });
    const saved = resolveArrivalFeasibility({ ...BASE, geoConfidence: "saved" });
    const ip = resolveArrivalFeasibility({ ...BASE, geoConfidence: "ip" });

    expect(saved.appliedBufferMinutes).toBeGreaterThanOrEqual(gps.appliedBufferMinutes);
    expect(saved.appliedBufferMinutes).toBeLessThanOrEqual(ip.appliedBufferMinutes);
  });

  it("none confidence applies maximum expansion", () => {
    const ip = resolveArrivalFeasibility({ ...BASE, geoConfidence: "ip" });
    const none = resolveArrivalFeasibility({ ...BASE, geoConfidence: "none" });
    expect(none.appliedBufferMinutes).toBeGreaterThanOrEqual(ip.appliedBufferMinutes);
  });

  it("gps confidence has confidence: high", () => {
    const result = resolveArrivalFeasibility({ ...BASE, geoConfidence: "gps" });
    expect(result.confidence).toBe("high");
  });

  it("ip confidence has confidence: low", () => {
    const result = resolveArrivalFeasibility({ ...BASE, geoConfidence: "ip" });
    expect(result.confidence).toBe("low");
  });
});

// ── E: Cross-city unknown distance ───────────────────────────────────────────

describe("E — cross-city unknown distance", () => {
  it("cityMatch=false applies large conservative buffer", () => {
    const result = resolveArrivalFeasibility({
      now: BASE_NOW,
      slotStartTime: slotAt(BASE_NOW, 90),
      cityMatch: false,
    });
    // totalBuffer = 15 MOB + 60 travel + 20 geo(none) = 95
    expect(result.appliedBufferMinutes).toBe(95);
    expect(result.confidence).toBe("low");
  });

  it("cross-city has larger buffer than same-city", () => {
    const sameCity = resolveArrivalFeasibility({
      now: BASE_NOW,
      slotStartTime: slotAt(BASE_NOW, 90),
      cityMatch: true,
    });
    const crossCity = resolveArrivalFeasibility({
      now: BASE_NOW,
      slotStartTime: slotAt(BASE_NOW, 90),
      cityMatch: false,
    });
    expect(crossCity.appliedBufferMinutes).toBeGreaterThan(sameCity.appliedBufferMinutes);
  });

  it("cross-city reason is too_soon_no_distance_city_mismatch when infeasible", () => {
    // Slot at +30 min: passes MOB (15 min) but fails totalBuffer (15+60+20=95 min)
    const result = resolveArrivalFeasibility({
      now: BASE_NOW,
      slotStartTime: slotAt(BASE_NOW, 30),
      cityMatch: false,
    });
    expect(result.feasible).toBe(false);
    expect(result.reason).toBe("too_soon_no_distance_city_mismatch");
  });
});

// ── F: Same-city unknown distance ────────────────────────────────────────────

describe("F — same-city unknown distance", () => {
  it("cityMatch=true applies moderate conservative buffer", () => {
    const result = resolveArrivalFeasibility({
      now: BASE_NOW,
      slotStartTime: slotAt(BASE_NOW, 90),
      cityMatch: true,
    });
    // totalBuffer = 15 MOB + 30 travel + 20 geo(none) = 65
    expect(result.appliedBufferMinutes).toBe(65);
    expect(result.confidence).toBe("low");
  });

  it("same-city reason is too_soon_no_distance_city_match when infeasible", () => {
    // Slot at +30 min: passes MOB (15 min) but fails totalBuffer (15+30+20=65 min)
    const result = resolveArrivalFeasibility({
      now: BASE_NOW,
      slotStartTime: slotAt(BASE_NOW, 30),
      cityMatch: true,
    });
    expect(result.feasible).toBe(false);
    expect(result.reason).toBe("too_soon_no_distance_city_match");
  });
});

// ── G: Distance 0, MOB still applies ─────────────────────────────────────────

describe("G — zero distance", () => {
  it("distanceKm=0 still applies minimum operational buffer", () => {
    const result = resolveArrivalFeasibility({
      now: BASE_NOW,
      slotStartTime: slotAt(BASE_NOW, 5), // only 5 min — fails MOB (15)
      distanceKm: 0,
      geoConfidence: "gps",
    });
    expect(result.feasible).toBe(false);
    expect(result.reason).toBe("minimum_operational_buffer");
  });

  it("distanceKm=0, slot at 25 min is feasible (15 MOB + 10 walkable = 25)", () => {
    const result = resolveArrivalFeasibility({
      now: BASE_NOW,
      slotStartTime: slotAt(BASE_NOW, 25),
      distanceKm: 0,
      geoConfidence: "gps",
    });
    expect(result.feasible).toBe(true);
    expect(result.appliedBufferMinutes).toBe(25);
  });
});

// ── H: Determinism ────────────────────────────────────────────────────────────

describe("H — determinism", () => {
  it("same input twice → identical output", () => {
    const input: ArrivalFeasibilityInput = {
      now: BASE_NOW,
      slotStartTime: slotAt(BASE_NOW, 55),
      distanceKm: 12,
      geoConfidence: "saved",
      cityMatch: true,
      isSynthetic: false,
    };
    const a = resolveArrivalFeasibility(input);
    const b = resolveArrivalFeasibility(input);

    expect(a.feasible).toBe(b.feasible);
    expect(a.reason).toBe(b.reason);
    expect(a.appliedBufferMinutes).toBe(b.appliedBufferMinutes);
    expect(a.confidence).toBe(b.confidence);
    expect(a.earliestAllowedAt.getTime()).toBe(b.earliestAllowedAt.getTime());
  });
});

// ── I: Timezone / DST — arithmetic is ms-based, never local-string arithmetic ─

describe("I — DST safety (ms arithmetic)", () => {
  it("slot spanning a 1-hour DST gap evaluates correctly", () => {
    // CET → CEST: clocks spring forward 1h at 2:00 AM on last Sunday of March.
    // 2026-03-29T01:00:00Z = 02:00 Belgrade (CET, UTC+1) — one hour before the gap.
    // A slot at 2026-03-29T02:30:00Z = 04:30 Belgrade (CEST, UTC+2, post-jump).
    // The gap means local "03:xx" doesn't exist, but UTC ms arithmetic is unaffected.
    const dstNow = new Date("2026-03-29T01:00:00.000Z");
    const slotAfterDstGap = new Date("2026-03-29T02:30:00.000Z"); // 90 min later in UTC

    const result = resolveArrivalFeasibility({
      now: dstNow,
      slotStartTime: slotAfterDstGap,
      distanceKm: 3,
      geoConfidence: "gps",
    });

    // buffer = 15 MOB + 25 travel = 40 min → earliestAllowedAt = dstNow + 40min
    // slotAfterDstGap is 90 min after dstNow → should be feasible
    expect(result.feasible).toBe(true);
    expect(result.appliedBufferMinutes).toBe(40);
  });

  it("slot 30 min after DST-boundary now with 40-min buffer is infeasible", () => {
    const dstNow = new Date("2026-03-29T01:00:00.000Z");
    const tooSoonSlot = new Date("2026-03-29T01:30:00.000Z"); // 30 min UTC

    const result = resolveArrivalFeasibility({
      now: dstNow,
      slotStartTime: tooSoonSlot,
      distanceKm: 5,
      geoConfidence: "gps",
    });

    // buffer = 40 min, slot is only 30 min away → infeasible
    expect(result.feasible).toBe(false);
    expect(result.reason).toBe("too_soon_travel_estimated");
  });
});

// ── J: Belgrade DST spring-forward off-by-one guard ──────────────────────────

describe("J — Belgrade DST spring-forward off-by-one", () => {
  it("buffer arithmetic does not gain or lose an hour across DST boundary", () => {
    // Before spring-forward: Belgrade = UTC+1
    const before = new Date("2026-03-29T00:45:00.000Z"); // 01:45 Belgrade
    // After spring-forward: Belgrade = UTC+2 (clocks jumped from 02:00 to 03:00)
    const after = new Date("2026-03-29T02:15:00.000Z"); // 04:15 Belgrade

    const bufferResult = resolveArrivalFeasibility({
      now: before,
      slotStartTime: after,
      distanceKm: 5,
      geoConfidence: "gps",
    });

    // UTC delta: 02:15 - 00:45 = 90 minutes. Buffer = 40 min. Should be feasible.
    expect(bufferResult.feasible).toBe(true);
    // Buffer must be exactly 40 min — no off-by-one-hour
    expect(bufferResult.appliedBufferMinutes).toBe(40);
    // earliestAllowedAt must be exactly now + 40 min in UTC ms
    expect(bufferResult.earliestAllowedAt.getTime()).toBe(
      before.getTime() + 40 * 60_000,
    );
  });
});

// ── K: GeoConfidence 'none' ───────────────────────────────────────────────────

describe("K — geoConfidence none", () => {
  it("none applies maximum expansion, not gps defaults", () => {
    const gps = resolveArrivalFeasibility({
      now: BASE_NOW,
      slotStartTime: slotAt(BASE_NOW, 60),
      distanceKm: 5,
      geoConfidence: "gps",
    });
    const none = resolveArrivalFeasibility({
      now: BASE_NOW,
      slotStartTime: slotAt(BASE_NOW, 60),
      distanceKm: 5,
      geoConfidence: "none",
    });
    expect(none.appliedBufferMinutes).toBeGreaterThan(gps.appliedBufferMinutes);
  });

  it("undefined geoConfidence behaves same as none", () => {
    const none = resolveArrivalFeasibility({
      now: BASE_NOW,
      slotStartTime: slotAt(BASE_NOW, 60),
      distanceKm: 5,
      geoConfidence: "none",
    });
    const undef = resolveArrivalFeasibility({
      now: BASE_NOW,
      slotStartTime: slotAt(BASE_NOW, 60),
      distanceKm: 5,
      geoConfidence: undefined,
    });
    expect(undef.appliedBufferMinutes).toBe(none.appliedBufferMinutes);
  });
});

// ── L: isExplicitIntent does not alter buffer ─────────────────────────────────

describe("L — isExplicitIntent does not affect buffer", () => {
  it("explicit and ambient produce identical feasibility verdict", () => {
    const base: ArrivalFeasibilityInput = {
      now: BASE_NOW,
      slotStartTime: slotAt(BASE_NOW, 50),
      distanceKm: 5,
      geoConfidence: "gps",
    };
    const explicit = resolveArrivalFeasibility({ ...base, isExplicitIntent: true });
    const ambient = resolveArrivalFeasibility({ ...base, isExplicitIntent: false });

    expect(explicit.feasible).toBe(ambient.feasible);
    expect(explicit.appliedBufferMinutes).toBe(ambient.appliedBufferMinutes);
    expect(explicit.reason).toBe(ambient.reason);
  });
});

// ── Buffer constant checks ────────────────────────────────────────────────────

describe("buffer constant validation", () => {
  it("walkable trip (0.5km, gps) has buffer = 25 min (15 MOB + 10 walk)", () => {
    const result = resolveArrivalFeasibility({
      now: BASE_NOW,
      slotStartTime: slotAt(BASE_NOW, 30),
      distanceKm: 0.5,
      geoConfidence: "gps",
    });
    expect(result.appliedBufferMinutes).toBe(25);
  });

  it("medium trip (5km, gps) has buffer = 40 min (15 MOB + 25 travel)", () => {
    const result = resolveArrivalFeasibility({
      now: BASE_NOW,
      slotStartTime: slotAt(BASE_NOW, 50),
      distanceKm: 5,
      geoConfidence: "gps",
    });
    expect(result.appliedBufferMinutes).toBe(40);
  });

  it("far trip (20km, gps) has buffer = 55 min (15 MOB + 40 travel)", () => {
    const result = resolveArrivalFeasibility({
      now: BASE_NOW,
      slotStartTime: slotAt(BASE_NOW, 60),
      distanceKm: 20,
      geoConfidence: "gps",
    });
    expect(result.appliedBufferMinutes).toBe(55);
  });

  it("unknown city match has buffer = 95 min (15 MOB + 60 travel + 20 geo)", () => {
    const result = resolveArrivalFeasibility({
      now: BASE_NOW,
      slotStartTime: slotAt(BASE_NOW, 100),
      cityMatch: undefined,
      geoConfidence: undefined,
    });
    expect(result.appliedBufferMinutes).toBe(95);
  });
});

// src/tests/fallbackPolicy.test.ts
//
// Coverage for resolveFallbackPolicy() and applyFallbackPolicy().

import {
  resolveFallbackPolicy,
  applyFallbackPolicy,
  type SearchIntent,
  type PolicyFilterableSlot,
} from "@/lib/availability/fallbackPolicy";

// ── Helpers ───────────────────────────────────────────────────────────────────

function slot(
  fallbackLevel: number,
  isSynthetic = false,
): PolicyFilterableSlot {
  return { fallbackLevel, isSynthetic };
}

// ── M: QuickAccess always rejects synthetic ───────────────────────────────────

describe("M — QuickAccess rejects synthetic", () => {
  const intents: SearchIntent["kind"][] = [
    "implicit_geo",
    "explicit_service",
    "explicit_city_service",
    "explicit_full",
    "discovery",
  ];

  intents.forEach((kind) => {
    it(`rejects synthetic for intent: ${kind}`, () => {
      const policy = resolveFallbackPolicy("quickaccess", { kind } as SearchIntent);
      expect(policy.allowSynthetic).toBe(false);

      const result = applyFallbackPolicy(
        [slot(1, true), slot(1, false)],
        policy,
      );
      expect(result).toHaveLength(1);
      expect(result[0].isSynthetic).toBe(false);
    });
  });
});

// ── N: QuickAccess ambient — allows L5 nearby, blocks L6 synthetic ───────────

describe("N — QuickAccess ambient allows L5 nearby, rejects L6 synthetic", () => {
  it("implicit_geo maxFallbackLevel is 5 and allowNearbyCities is true", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "implicit_geo" });
    expect(policy.maxFallbackLevel).toBe(5);
    expect(policy.allowNearbyCities).toBe(true);
  });

  it("L5 nearby-city slot passes for implicit_geo", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "implicit_geo" });
    const l5Slot = { fallbackLevel: 5, isSynthetic: false, slotOrigins: ["nearby_city" as const] };
    const result = applyFallbackPolicy([l5Slot], policy);
    expect(result).toHaveLength(1);
  });

  it("L6 synthetic is still rejected for implicit_geo (allowSynthetic=false)", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "implicit_geo" });
    expect(policy.allowSynthetic).toBe(false);
    const result = applyFallbackPolicy([slot(6, true)], policy);
    expect(result).toHaveLength(0);
  });

  it("L3 slot with related_service origin is rejected (allowCategoryDrift=false)", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "implicit_geo" });
    expect(policy.allowCategoryDrift).toBe(false);

    const l3Slot = { fallbackLevel: 3, isSynthetic: false, slotOrigins: ["related_service" as const] };
    const result = applyFallbackPolicy([l3Slot], policy);
    expect(result).toHaveLength(0);
  });

  it("L4 slot without related_service origin is accepted (ambient discovery, same city)", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "implicit_geo" });
    const l4Slot = { fallbackLevel: 4, isSynthetic: false, slotOrigins: ["real" as const] };
    const result = applyFallbackPolicy([l4Slot], policy);
    expect(result).toHaveLength(1);
  });
});

// ── O: QuickAccess accepts L1/L2 service variant ─────────────────────────────

describe("O — QuickAccess accepts service variants", () => {
  it("service variants allowed for explicit_service (L1 slot passes)", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "explicit_service" });
    expect(policy.allowServiceVariants).toBe(true);

    const result = applyFallbackPolicy([slot(1, false)], policy);
    expect(result).toHaveLength(1);
  });

  it("explicit_service max level is 1", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "explicit_service" });
    expect(policy.maxFallbackLevel).toBe(1);

    // L2 slot is rejected even though it's real and no category drift
    const result = applyFallbackPolicy([slot(2, false)], policy);
    expect(result).toHaveLength(0);
  });

  it("explicit_city_service accepts L2 slot", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "explicit_city_service" });
    expect(policy.maxFallbackLevel).toBe(2);

    const result = applyFallbackPolicy([slot(2, false)], policy);
    expect(result).toHaveLength(1);
  });
});

// ── P: BookingWidget accepts L5 (nearby cities) ──────────────────────────────

describe("P — BookingWidget accepts L5", () => {
  it("L5 slot passes for discovery intent", () => {
    const policy = resolveFallbackPolicy("bookingwidget", { kind: "discovery" });
    expect(policy.maxFallbackLevel).toBe(5);
    expect(policy.allowNearbyCities).toBe(true);

    const result = applyFallbackPolicy([slot(5, false)], policy);
    expect(result).toHaveLength(1);
  });

  it("L6 synthetic is rejected by BookingWidget", () => {
    const policy = resolveFallbackPolicy("bookingwidget", { kind: "discovery" });
    expect(policy.allowSynthetic).toBe(false);

    const result = applyFallbackPolicy([slot(6, true)], policy);
    expect(result).toHaveLength(0);
  });
});

// ── Q: BookingWidget rejects L6 synthetic ────────────────────────────────────

describe("Q — BookingWidget rejects L6 synthetic", () => {
  it("synthetic L6 is always rejected", () => {
    const policy = resolveFallbackPolicy("bookingwidget", { kind: "implicit_geo" });
    const result = applyFallbackPolicy(
      [slot(6, true), slot(4, false), slot(5, false)],
      policy,
    );
    // Only L4 and L5 real slots survive
    expect(result).toHaveLength(2);
    result.forEach((s) => expect(s.isSynthetic).toBe(false));
  });
});

// ── R: AI recovery accepts all ───────────────────────────────────────────────

describe("R — AI recovery accepts all origins", () => {
  it("accepts synthetic L6", () => {
    const policy = resolveFallbackPolicy("ai_recovery", { kind: "ai_recovery" });
    expect(policy.allowSynthetic).toBe(true);
    expect(policy.maxFallbackLevel).toBe(6);

    const result = applyFallbackPolicy(
      [slot(6, true), slot(5, false), slot(1, false)],
      policy,
    );
    expect(result).toHaveLength(3);
  });

  it("allows category drift", () => {
    const policy = resolveFallbackPolicy("ai_recovery", { kind: "ai_recovery" });
    expect(policy.allowCategoryDrift).toBe(true);
    expect(policy.allowNearbyCities).toBe(true);
  });
});

// ── S: Policy is pure ────────────────────────────────────────────────────────

describe("S — policy is deterministic", () => {
  it("same (strategy, intent) → identical FallbackPolicy", () => {
    const a = resolveFallbackPolicy("quickaccess", { kind: "explicit_service" });
    const b = resolveFallbackPolicy("quickaccess", { kind: "explicit_service" });

    expect(a).toEqual(b);
  });

  it("different intents produce different maxFallbackLevel for QuickAccess", () => {
    const implicit = resolveFallbackPolicy("quickaccess", { kind: "implicit_geo" });
    const explicit = resolveFallbackPolicy("quickaccess", { kind: "explicit_service" });

    expect(explicit.maxFallbackLevel).toBe(1);
    // implicit_geo = 5 (ambient display; nearby cities allowed when local supply is empty)
    expect(implicit.maxFallbackLevel).toBe(5);
    expect(implicit.maxFallbackLevel).toBeGreaterThan(explicit.maxFallbackLevel);
  });
});

// ── T: Empty input → empty output ────────────────────────────────────────────

describe("T — empty slots", () => {
  it("returns empty array without throwing", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "implicit_geo" });
    expect(applyFallbackPolicy([], policy)).toEqual([]);
  });
});

// ── U: explicit_service → maxFallbackLevel: 1 ────────────────────────────────

describe("U — explicit_service max level", () => {
  it("maxFallbackLevel is 1", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "explicit_service" });
    expect(policy.maxFallbackLevel).toBe(1);
  });

  it("only L0 and L1 slots survive", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "explicit_service" });
    const input = [slot(0), slot(1), slot(2), slot(3)];
    const result = applyFallbackPolicy(input, policy);
    expect(result).toHaveLength(2);
    result.forEach((s) => expect(s.fallbackLevel).toBeLessThanOrEqual(1));
  });
});

// ── V: explicit_city_service → maxFallbackLevel: 2 ───────────────────────────

describe("V — explicit_city_service max level", () => {
  it("maxFallbackLevel is 2", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "explicit_city_service" });
    expect(policy.maxFallbackLevel).toBe(2);
  });

  it("L3 slot is rejected", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "explicit_city_service" });
    const result = applyFallbackPolicy([slot(3)], policy);
    expect(result).toHaveLength(0);
  });
});

// ── W: implicit_geo → maxFallbackLevel: 4 ────────────────────────────────────
// implicit_geo = ambient display with no specific user request.
// findBestSlots returns L4 (same city, any category) when no params.category is set.
// L4 IS the expected level for ambient display — not a semantic fallback.
// L5 (cross-city) and L6 (synthetic) are still blocked by allowNearbyCities=false
// and allowSynthetic=false respectively.

// ── W: implicit_geo → maxFallbackLevel: 5, allowNearbyCities: true ───────────
// Ambient display: no specific city/service was requested, so nearby-city
// results are useful when the local city has no supply. L6 (synthetic) still
// blocked by allowSynthetic=false.

describe("W — implicit_geo max level", () => {
  it("maxFallbackLevel is 5 (nearby-city slots allowed for ambient display)", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "implicit_geo" });
    expect(policy.maxFallbackLevel).toBe(5);
  });

  it("nearby cities allowed, no category drift, no synthetic", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "implicit_geo" });
    expect(policy.allowNearbyCities).toBe(true);
    expect(policy.allowCategoryDrift).toBe(false);
    expect(policy.allowSynthetic).toBe(false);
  });

  it("L4 slot with no cross-city origin passes (ambient same-city discovery)", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "implicit_geo" });
    const l4Slot = { fallbackLevel: 4, isSynthetic: false, slotOrigins: ["real" as const] };
    expect(applyFallbackPolicy([l4Slot], policy)).toHaveLength(1);
  });

  it("L5 nearby-city slot passes (local city has no supply → show nearby)", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "implicit_geo" });
    const l5Slot = { fallbackLevel: 5, isSynthetic: false, slotOrigins: ["nearby_city" as const] };
    expect(applyFallbackPolicy([l5Slot], policy)).toHaveLength(1);
  });

  it("L6 synthetic is rejected even for ambient display", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "implicit_geo" });
    expect(applyFallbackPolicy([slot(6, true)], policy)).toHaveLength(0);
  });
});

// ── SearchPage: full access ───────────────────────────────────────────────────

describe("SearchPage — full results", () => {
  it("accepts everything including synthetic L6", () => {
    const policy = resolveFallbackPolicy("searchpage", { kind: "discovery" });
    expect(policy.maxFallbackLevel).toBe(6);
    expect(policy.allowSynthetic).toBe(true);
    expect(policy.allowNearbyCities).toBe(true);
    expect(policy.allowCategoryDrift).toBe(true);
  });
});

// ── Policy invariants ─────────────────────────────────────────────────────────

describe("policy invariants", () => {
  it("QuickAccess never allows synthetic for any intent", () => {
    const intents: SearchIntent["kind"][] = [
      "implicit_geo",
      "explicit_service",
      "explicit_city_service",
      "explicit_full",
      "ai_recovery",
      "discovery",
    ];
    intents.forEach((kind) => {
      const policy = resolveFallbackPolicy("quickaccess", { kind } as SearchIntent);
      expect(policy.allowSynthetic).toBe(false);
    });
  });

  it("QuickAccess never allows nearby cities for explicit intents", () => {
    // Explicit intents name a specific service/city — nearby cities would be misleading.
    const intents: SearchIntent["kind"][] = [
      "explicit_service",
      "explicit_city_service",
      "explicit_full",
    ];
    intents.forEach((kind) => {
      const policy = resolveFallbackPolicy("quickaccess", { kind } as SearchIntent);
      expect(policy.allowNearbyCities).toBe(false);
    });
  });

  it("QuickAccess allows nearby cities for ambient/exploratory intents", () => {
    // Ambient display: no specific city was requested, nearby results are useful.
    const intents: SearchIntent["kind"][] = ["implicit_geo", "discovery", "ai_recovery"];
    intents.forEach((kind) => {
      const policy = resolveFallbackPolicy("quickaccess", { kind } as SearchIntent);
      expect(policy.allowNearbyCities).toBe(true);
    });
  });

  it("BookingWidget never allows synthetic", () => {
    const intents: SearchIntent["kind"][] = ["discovery", "implicit_geo", "explicit_service"];
    intents.forEach((kind) => {
      const policy = resolveFallbackPolicy("bookingwidget", { kind } as SearchIntent);
      expect(policy.allowSynthetic).toBe(false);
    });
  });

  it("applyFallbackPolicy is a pure filter — never adds or mutates slots", () => {
    const policy = resolveFallbackPolicy("searchpage", { kind: "discovery" });
    const input = [slot(1), slot(2, true), slot(6)];
    const result = applyFallbackPolicy(input, policy);

    // All 3 pass for searchpage
    expect(result).toHaveLength(3);
    // Same references — no mutation
    expect(result[0]).toBe(input[0]);
    expect(result[1]).toBe(input[1]);
    expect(result[2]).toBe(input[2]);
  });
});

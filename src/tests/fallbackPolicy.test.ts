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

// ── N: QuickAccess ambient — capped at L2, blocks nearby/synthetic ───────────

describe("N — QuickAccess ambient is trust-capped", () => {
  it("implicit_geo maxFallbackLevel is 2 and allowNearbyCities is false", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "implicit_geo" });
    expect(policy.maxFallbackLevel).toBe(2);
    expect(policy.allowNearbyCities).toBe(false);
  });

  it("L6 synthetic is still rejected for implicit_geo (allowSynthetic=false)", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "implicit_geo" });
    expect(policy.allowSynthetic).toBe(false);
    const result = applyFallbackPolicy([slot(6, true)], policy);
    expect(result).toHaveLength(0);
  });

  it("L4 slot without related_service origin passes when availability is trustworthy", () => {
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

    // Trusted availability is allowed even when it came from a relaxed level.
    const result = applyFallbackPolicy([slot(2, false)], policy);
    expect(result).toHaveLength(1);
  });

  it("explicit_city_service accepts L2 slot", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "explicit_city_service" });
    expect(policy.maxFallbackLevel).toBe(2);

    const result = applyFallbackPolicy([slot(2, false)], policy);
    expect(result).toHaveLength(1);
  });
});

// ── P: BookingWidget accepts discovery up to L3 ──────────────────────────────

describe("P — BookingWidget is capped at L3", () => {
  it("L3 slot passes for discovery intent", () => {
    const policy = resolveFallbackPolicy("bookingwidget", { kind: "discovery" });
    expect(policy.maxFallbackLevel).toBe(3);
    expect(policy.allowNearbyCities).toBe(true);

    const result = applyFallbackPolicy([slot(3, false)], policy);
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
    // L4/L5 trusted slots pass; only synthetic is rejected.
    expect(result).toHaveLength(2);
    result.forEach((s) => expect(s.isSynthetic).toBe(false));
  });
});

// ── R: AI recovery is capped at L5 ───────────────────────────────────────────

describe("R — AI recovery is capped at L5", () => {
  it("rejects synthetic L6 via the L5 recovery cap", () => {
    const policy = resolveFallbackPolicy("ai_recovery", { kind: "ai_recovery" });
    expect(policy.allowSynthetic).toBe(true);
    expect(policy.maxFallbackLevel).toBe(5);

    const result = applyFallbackPolicy(
      [slot(6, true), slot(5, false), slot(1, false)],
      policy,
    );
    expect(result).toHaveLength(2);
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
    expect(implicit.maxFallbackLevel).toBe(2);
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

  it("trusted slots survive even past the fallback cap", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "explicit_service" });
    const input = [slot(0), slot(1), slot(2), slot(3)];
    const result = applyFallbackPolicy(input, policy);
    expect(result).toHaveLength(4);
  });
});

// ── V: explicit_city_service → maxFallbackLevel: 2 ───────────────────────────

describe("V — explicit_city_service max level", () => {
  it("maxFallbackLevel is 2", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "explicit_city_service" });
    expect(policy.maxFallbackLevel).toBe(2);
  });

  it("trusted L3 slot passes", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "explicit_city_service" });
    const result = applyFallbackPolicy([slot(3)], policy);
    expect(result).toHaveLength(1);
  });
});

// ── W: implicit_geo → maxFallbackLevel: 2, no nearby cities ──────────────────
// Ambient QuickAccess is a trust surface. L3+ recovery belongs to BookingWidget
// or AI recovery, not to the homepage quick picks.

describe("W — implicit_geo max level", () => {
  it("maxFallbackLevel is 2", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "implicit_geo" });
    expect(policy.maxFallbackLevel).toBe(2);
  });

  it("nearby cities blocked, no category drift, no synthetic", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "implicit_geo" });
    expect(policy.allowNearbyCities).toBe(false);
    expect(policy.allowCategoryDrift).toBe(false);
    expect(policy.allowSynthetic).toBe(false);
  });

  it("L4 slot with no cross-city origin passes", () => {
    const policy = resolveFallbackPolicy("quickaccess", { kind: "implicit_geo" });
    const l4Slot = { fallbackLevel: 4, isSynthetic: false, slotOrigins: ["real" as const] };
    expect(applyFallbackPolicy([l4Slot], policy)).toHaveLength(1);
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

  it("QuickAccess blocks nearby cities for ambient/exploratory intents", () => {
    const intents: SearchIntent["kind"][] = ["implicit_geo", "discovery", "ai_recovery"];
    intents.forEach((kind) => {
      const policy = resolveFallbackPolicy("quickaccess", { kind } as SearchIntent);
      expect(policy.allowNearbyCities).toBe(false);
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

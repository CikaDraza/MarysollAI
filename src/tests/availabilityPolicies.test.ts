import {
  canShowInBookingWidget,
  canShowInQuickAccess,
  canUseAsSyntheticFallback,
  explainQuickAccessPolicy,
} from "@/lib/availability/policies";

describe("centralized availability surface policies", () => {
  it("allows calendar_verified and working_hours_only in QuickAccess", () => {
    expect(canShowInQuickAccess({ availabilityConfidence: "calendar_verified" })).toBe(true);
    expect(canShowInQuickAccess({ availabilityConfidence: "working_hours_only" })).toBe(true);
  });

  it("rejects synthetic_projection in primary QuickAccess", () => {
    const slot = { availabilityConfidence: "synthetic_projection" as const };
    expect(canShowInQuickAccess(slot)).toBe(false);
    expect(explainQuickAccessPolicy(slot)).toEqual({
      accepted: false,
      reason: "synthetic_primary_surface",
    });
  });

  it("allows BookingWidget synthetic only when recovery is explicit", () => {
    const slot = { availabilityConfidence: "synthetic_projection" as const };
    expect(canShowInBookingWidget(slot)).toBe(false);
    expect(canShowInBookingWidget(slot, { allowSyntheticRecovery: true })).toBe(true);
  });

  it("detects synthetic fallback candidates explicitly", () => {
    expect(canUseAsSyntheticFallback({ availabilityConfidence: "synthetic_projection" })).toBe(true);
    expect(canUseAsSyntheticFallback({ availabilityConfidence: "working_hours_only" })).toBe(false);
  });
});

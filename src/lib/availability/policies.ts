// src/lib/availability/policies.ts

import type { AvailabilityConfidence } from "./availabilityConfidence";
import { isSyntheticAvailability, isVerifiedAvailability } from "./availabilityConfidence";

export type AvailabilityPolicySurface = "quickaccess" | "bookingwidget";

export type AvailabilityPolicyRejectedReason =
  | "none"
  | "invalid_confidence"
  | "synthetic_primary_surface";

export interface AvailabilityPolicySlot {
  availabilityConfidence?: AvailabilityConfidence;
  isSynthetic?: boolean;
}

export interface AvailabilityPolicyOptions {
  emergencySyntheticFallback?: boolean;
  allowSyntheticRecovery?: boolean;
}

export interface AvailabilityPolicyDecision {
  accepted: boolean;
  reason: AvailabilityPolicyRejectedReason;
}

function confidence(slot: AvailabilityPolicySlot): AvailabilityConfidence | undefined {
  if (slot.availabilityConfidence) return slot.availabilityConfidence;
  if (slot.isSynthetic === true) return "synthetic_projection";
  return "calendar_verified";
}

function evaluatePrimarySurface(
  slot: AvailabilityPolicySlot,
  opts: AvailabilityPolicyOptions,
): AvailabilityPolicyDecision {
  const conf = confidence(slot);

  if (conf === "calendar_verified" || conf === "working_hours_only") {
    return { accepted: true, reason: "none" };
  }

  if (isSyntheticAvailability(conf)) {
    return opts.emergencySyntheticFallback || opts.allowSyntheticRecovery
      ? { accepted: true, reason: "none" }
      : { accepted: false, reason: "synthetic_primary_surface" };
  }

  return { accepted: false, reason: "invalid_confidence" };
}

export function canShowInQuickAccess(
  slot: AvailabilityPolicySlot,
  opts: AvailabilityPolicyOptions = {},
): boolean {
  return evaluatePrimarySurface(slot, {
    emergencySyntheticFallback: opts.emergencySyntheticFallback,
  }).accepted;
}

export function canShowInBookingWidget(
  slot: AvailabilityPolicySlot,
  opts: AvailabilityPolicyOptions = {},
): boolean {
  return evaluatePrimarySurface(slot, {
    allowSyntheticRecovery: opts.allowSyntheticRecovery,
  }).accepted;
}

export function canUseAsSyntheticFallback(slot: AvailabilityPolicySlot): boolean {
  return isSyntheticAvailability(confidence(slot));
}

export function explainQuickAccessPolicy(
  slot: AvailabilityPolicySlot,
  opts: AvailabilityPolicyOptions = {},
): AvailabilityPolicyDecision {
  return evaluatePrimarySurface(slot, {
    emergencySyntheticFallback: opts.emergencySyntheticFallback,
  });
}

export function explainBookingWidgetPolicy(
  slot: AvailabilityPolicySlot,
  opts: AvailabilityPolicyOptions = {},
): AvailabilityPolicyDecision {
  return evaluatePrimarySurface(slot, {
    allowSyntheticRecovery: opts.allowSyntheticRecovery,
  });
}

export function hasTrustworthyAvailability(slot: AvailabilityPolicySlot): boolean {
  const conf = confidence(slot);
  return isVerifiedAvailability(conf) || conf === "working_hours_only";
}

// src/lib/availability/availabilityConfidence.ts

export type AvailabilityConfidence =
  | "calendar_verified"
  | "working_hours_only"
  | "synthetic_projection";

export type AvailabilityType =
  | "verified"
  | "working_hours"
  | "synthetic";

export function getAvailabilityConfidenceScore(
  confidence: AvailabilityConfidence | null | undefined,
): number {
  if (confidence === "calendar_verified") return 1;
  if (confidence === "working_hours_only") return 0.55;
  if (confidence === "synthetic_projection") return 0.15;
  return 0;
}

export function getAvailabilityType(
  confidence: AvailabilityConfidence | null | undefined,
): AvailabilityType | undefined {
  if (confidence === "calendar_verified") return "verified";
  if (confidence === "working_hours_only") return "working_hours";
  if (confidence === "synthetic_projection") return "synthetic";
  return undefined;
}

export function isVerifiedAvailability(
  confidence: AvailabilityConfidence | null | undefined,
): boolean {
  return confidence === "calendar_verified";
}

export function isSyntheticAvailability(
  confidence: AvailabilityConfidence | null | undefined,
): boolean {
  return confidence === "synthetic_projection";
}

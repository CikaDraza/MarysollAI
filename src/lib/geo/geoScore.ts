// src/lib/geo/geoScore.ts

interface DistanceScoreParams {
  distanceKm: number;
  intentType?: string;
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function calculateDistanceScore(params: DistanceScoreParams): number {
  const { distanceKm } = params;
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return 0;

  // Piecewise curve keeps "very near" meaningfully better while avoiding a
  // cliff where 3.1km suddenly looks bad. intentType is accepted now so future
  // intent-aware distance curves can be added without changing call sites.
  if (distanceKm <= 1) return 1;
  if (distanceKm <= 3) return clamp01(0.9 - ((distanceKm - 1) / 2) * 0.15);
  if (distanceKm <= 7) return clamp01(0.75 - ((distanceKm - 3) / 4) * 0.25);
  if (distanceKm <= 15) return clamp01(0.5 - ((distanceKm - 7) / 8) * 0.3);
  return clamp01(0.2 / (1 + (distanceKm - 15) / 10));
}

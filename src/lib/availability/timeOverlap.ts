// src/lib/availability/timeOverlap.ts

export function parseHHmmToMinutes(value: string): number {
  if (typeof value !== "string") return NaN;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return NaN;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return NaN;
  }

  return hours * 60 + minutes;
}

export function formatMinutesAsHHmm(minutes: number): string {
  if (!Number.isFinite(minutes)) return "";
  const bounded = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  const h = Math.floor(bounded / 60);
  const m = bounded % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function doTimeRangesOverlap(params: {
  startA: string;
  endA: string;
  startB: string;
  endB: string;
}): boolean {
  const startA = parseHHmmToMinutes(params.startA);
  const endA = parseHHmmToMinutes(params.endA);
  const startB = parseHHmmToMinutes(params.startB);
  const endB = parseHHmmToMinutes(params.endB);

  if (![startA, endA, startB, endB].every(Number.isFinite)) return false;
  if (startA >= endA || startB >= endB) return false;

  return startA < endB && startB < endA;
}

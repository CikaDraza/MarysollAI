const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Calendar-day distance between a "YYYY-MM-DD" preferredDate and now, computed
 * in UTC. Returns null when the date is missing or malformed.
 */
function preferredDateDaysAway(
  now: Date,
  preferredDate?: string,
): number | null {
  if (!preferredDate) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(preferredDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const target = Date.UTC(year, month - 1, day);
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Math.round((target - today) / DAY_MS);
}

/**
 * Minutes to wait before re-checking a watch. Nearer preferredDates poll more
 * frequently; distant ones back off to spare DB/API work on M0.
 */
function nextCheckDelayMinutes(now: Date, preferredDate?: string): number {
  const daysAway = preferredDateDaysAway(now, preferredDate);
  if (daysAway === null) return 15; // No preferred date — moderate cadence.
  if (daysAway <= 0) return 5; // Today (or already past) — check often.
  if (daysAway === 1) return 15; // Tomorrow.
  if (daysAway === 2) return 30; // Day after tomorrow.
  return 60; // 3+ days away — check infrequently.
}

/**
 * Computes the next time a watch should be re-checked, derived from how far its
 * preferredDate is from now.
 */
export function computeNextAvailabilityCheckAt(params: {
  now: Date;
  preferredDate?: string;
}): Date {
  const minutes = nextCheckDelayMinutes(params.now, params.preferredDate);
  return new Date(params.now.getTime() + minutes * MINUTE_MS);
}

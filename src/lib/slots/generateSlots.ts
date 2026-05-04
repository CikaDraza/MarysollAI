import type { MappedSalon } from "@/lib/mappers/salonMapper";

const DOW_TO_DAY: Record<number, string> = {
  0: "Nedelja",
  1: "Ponedeljak",
  2: "Utorak",
  3: "Sreda",
  4: "Četvrtak",
  5: "Petak",
  6: "Subota",
};

function parseHoursRange(str: string): { openMin: number; closeMin: number } | null {
  // Matches "09:00-20:00", "09:00 - 20:00", "9:00–20:00"
  const m = str.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return {
    openMin: parseInt(m[1], 10) * 60 + parseInt(m[2], 10),
    closeMin: parseInt(m[3], 10) * 60 + parseInt(m[4], 10),
  };
}

/** YYYY-MM-DD for a given date in Europe/Belgrade */
function belgradeDateStr(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(date);
}

/** Day-of-week (0=Sun) in Europe/Belgrade */
function belgradeDow(date: Date): number {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Belgrade",
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[short] ?? date.getDay();
}

/** Current time in Europe/Belgrade as total minutes since midnight */
function belgradeNowMinutes(): number {
  const timeStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Belgrade",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  const parts = timeStr.replace("24:", "00:").split(":");
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

export interface GeneratedSlot {
  startTime: string; // "YYYY-MM-DDTHH:MM:00" local-time (no TZ suffix)
  endTime: string;
  isSynthetic: true;
}

/**
 * Generates available time slots from a salon's working hours.
 *
 * Slot step equals serviceDuration — no overlapping slots for single-staff salons.
 * If serviceDuration is not provided, falls back to the first service on the salon
 * or 30 minutes as a last resort.
 *
 * For today: first slot must start at least bufferMin (default 30) after now.
 * For future days: first slot starts at opening time.
 */
export function generateSlotsFromWorkingHours(
  salon: MappedSalon,
  options: {
    daysAhead?: number;
    serviceDuration?: number; // minutes; step and duration for each slot
    bufferMin?: number;        // minimum gap from now for today's first slot
  } = {},
): GeneratedSlot[] {
  const { daysAhead = 14, bufferMin = 30 } = options;

  // Resolve duration: explicit > first salon service > 30 min fallback
  const serviceDuration =
    options.serviceDuration ??
    salon.services?.[0]?.duration ??
    30;

  const step = Math.max(serviceDuration, 15); // never step less than 15 min

  const result: GeneratedSlot[] = [];
  const nowBelgradeMin = belgradeNowMinutes();
  const todayBelgrade = belgradeDateStr(new Date());

  for (let d = 0; d < daysAhead; d++) {
    const date = new Date();
    date.setDate(date.getDate() + d);

    const dow = belgradeDow(date);
    const dayKey = DOW_TO_DAY[dow];
    const hoursStr = salon.workingHours?.[dayKey];
    if (!hoursStr) continue;

    const range = parseHoursRange(hoursStr);
    if (!range) continue;

    const dateStr = belgradeDateStr(date);
    const isToday = dateStr === todayBelgrade;

    for (let m = range.openMin; m + serviceDuration <= range.closeMin; m += step) {
      // For today: skip slots that can't be reached in time
      if (isToday && m < nowBelgradeMin + bufferMin) continue;

      const hh = Math.floor(m / 60).toString().padStart(2, "0");
      const mm = (m % 60).toString().padStart(2, "0");
      const startTime = `${dateStr}T${hh}:${mm}:00`;

      const endM = m + serviceDuration;
      const eh = Math.floor(endM / 60).toString().padStart(2, "0");
      const em = (endM % 60).toString().padStart(2, "0");
      const endTime = `${dateStr}T${eh}:${em}:00`;

      result.push({ startTime, endTime, isSynthetic: true });
    }
  }

  return result;
}

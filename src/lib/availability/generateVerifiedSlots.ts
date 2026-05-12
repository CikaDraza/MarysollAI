// src/lib/availability/generateVerifiedSlots.ts

import {
  getAvailabilityConfidenceScore,
  type AvailabilityConfidence,
} from "./availabilityConfidence";
import { isBlockingAppointmentStatus, type AppointmentStatus } from "./blockingStatuses";
import {
  doTimeRangesOverlap,
  formatMinutesAsHHmm,
  parseHHmmToMinutes,
} from "./timeOverlap";

export type WorkingHours =
  | Record<string, Array<{ from: string; to: string }>>
  | Record<string, string>;

export interface Appointment {
  date: string;
  time: string;
  duration?: number;
  status: AppointmentStatus | string;
}

export interface VerifiedAvailabilitySlot {
  date: string;
  startTime: string;
  endTime: string;
  time: string;
  duration: number;
  availabilityConfidence: Extract<AvailabilityConfidence, "calendar_verified">;
  availabilityConfidenceScore: number;
  availabilityType: "verified";
}

const DAY_KEYS = [
  "Nedelja",
  "Ponedeljak",
  "Utorak",
  "Sreda",
  "Četvrtak",
  "Petak",
  "Subota",
];

function dayKeyForDate(date: string): string | null {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  const parsed = new Date(y, m - 1, d);
  if (!Number.isFinite(parsed.getTime())) return null;
  return DAY_KEYS[parsed.getDay()] ?? null;
}

function readWorkingHourRanges(
  workingHours: WorkingHours,
  date: string,
): Array<{ from: string; to: string }> {
  const dayKey = dayKeyForDate(date);
  if (!dayKey) return [];

  const value = workingHours?.[dayKey];
  if (Array.isArray(value)) {
    return value.filter((r) => r?.from && r?.to);
  }

  if (typeof value === "string") {
    const [from, to] = value.split("-");
    return from && to ? [{ from, to }] : [];
  }

  return [];
}

function appointmentEndTime(app: Appointment): string {
  const start = parseHHmmToMinutes(app.time);
  const duration = Number.isFinite(app.duration) && (app.duration ?? 0) > 0
    ? app.duration!
    : 60;
  return formatMinutesAsHHmm(start + duration);
}

function toIso(date: string, time: string): string {
  return `${date}T${time}:00.000`;
}

export function generateVerifiedSlots(params: {
  workingHours: WorkingHours;
  appointments: Appointment[];
  date: string;
  requestedDuration: number;
  slotIntervalMinutes?: number;
}): VerifiedAvailabilitySlot[] {
  try {
    const requestedDuration = Math.max(1, Math.round(params.requestedDuration));
    const interval = Math.max(1, Math.round(params.slotIntervalMinutes ?? 30));
    const ranges = readWorkingHourRanges(params.workingHours, params.date);
    const blockingAppointments = (params.appointments ?? []).filter(
      (app) => app.date === params.date && isBlockingAppointmentStatus(app.status),
    );

    const slots: VerifiedAvailabilitySlot[] = [];
    const seen = new Set<string>();

    for (const range of ranges) {
      const rangeStart = parseHHmmToMinutes(range.from);
      const rangeEnd = parseHHmmToMinutes(range.to);
      if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd) || rangeStart >= rangeEnd) {
        continue;
      }

      for (
        let start = rangeStart;
        start + requestedDuration <= rangeEnd;
        start += interval
      ) {
        const startTime = formatMinutesAsHHmm(start);
        const endTime = formatMinutesAsHHmm(start + requestedDuration);
        const overlaps = blockingAppointments.some((app) =>
          doTimeRangesOverlap({
            startA: startTime,
            endA: endTime,
            startB: app.time,
            endB: appointmentEndTime(app),
          }),
        );

        if (overlaps || seen.has(startTime)) continue;
        seen.add(startTime);
        slots.push({
          date: params.date,
          startTime: toIso(params.date, startTime),
          endTime: toIso(params.date, endTime),
          time: startTime,
          duration: requestedDuration,
          availabilityConfidence: "calendar_verified",
          availabilityConfidenceScore: getAvailabilityConfidenceScore("calendar_verified"),
          availabilityType: "verified",
        });
      }
    }

    return slots;
  } catch {
    return [];
  }
}

import {
  getAvailabilityConfidenceScore,
  getAvailabilityType,
  isSyntheticAvailability,
  isVerifiedAvailability,
} from "@/lib/availability/availabilityConfidence";
import { isBlockingAppointmentStatus } from "@/lib/availability/blockingStatuses";
import { generateVerifiedSlots } from "@/lib/availability/generateVerifiedSlots";
import { doTimeRangesOverlap } from "@/lib/availability/timeOverlap";

describe("appointment blocking statuses", () => {
  it("treats only active/upcoming statuses as calendar-blocking", () => {
    expect(isBlockingAppointmentStatus("pending")).toBe(true);
    expect(isBlockingAppointmentStatus("appointment_approved")).toBe(true);
    expect(isBlockingAppointmentStatus("appointment_rescheduled")).toBe(true);

    expect(isBlockingAppointmentStatus("appointment_rejected")).toBe(false);
    expect(isBlockingAppointmentStatus("appointment_cancelled")).toBe(false);
    expect(isBlockingAppointmentStatus("completed")).toBe(false);
    expect(isBlockingAppointmentStatus("no_show")).toBe(false);
  });
});

describe("time overlap", () => {
  it("detects deterministic HH:mm range overlap", () => {
    expect(
      doTimeRangesOverlap({
        startA: "10:00",
        endA: "11:00",
        startB: "10:30",
        endB: "11:30",
      }),
    ).toBe(true);

    expect(
      doTimeRangesOverlap({
        startA: "10:00",
        endA: "11:00",
        startB: "11:00",
        endB: "12:00",
      }),
    ).toBe(false);
  });
});

describe("verified availability generation", () => {
  it("removes slots that overlap blocking appointments", () => {
    const slots = generateVerifiedSlots({
      workingHours: {
        Sreda: [{ from: "09:00", to: "12:00" }],
      },
      appointments: [
        {
          date: "2026-05-13",
          time: "10:00",
          duration: 60,
          status: "appointment_approved",
        },
      ],
      date: "2026-05-13",
      requestedDuration: 60,
    });

    expect(slots.map((s) => s.time)).toEqual(["09:00", "11:00"]);
    expect(slots.every((s) => s.availabilityConfidence === "calendar_verified")).toBe(true);
    expect(slots.every((s) => s.availabilityConfidenceScore === 1)).toBe(true);
    expect(slots.every((s) => s.availabilityType === "verified")).toBe(true);
  });

  it("ignores non-blocking appointment statuses", () => {
    const slots = generateVerifiedSlots({
      workingHours: {
        Sreda: [{ from: "09:00", to: "11:00" }],
      },
      appointments: [
        {
          date: "2026-05-13",
          time: "09:00",
          duration: 60,
          status: "appointment_cancelled",
        },
      ],
      date: "2026-05-13",
      requestedDuration: 60,
    });

    expect(slots.map((s) => s.time)).toEqual(["09:00", "09:30", "10:00"]);
  });
});

describe("availability confidence helpers", () => {
  it("maps confidence to numeric score and type", () => {
    expect(getAvailabilityConfidenceScore("calendar_verified")).toBe(1);
    expect(getAvailabilityConfidenceScore("working_hours_only")).toBe(0.55);
    expect(getAvailabilityConfidenceScore("synthetic_projection")).toBe(0.15);
    expect(getAvailabilityType("calendar_verified")).toBe("verified");
    expect(isVerifiedAvailability("calendar_verified")).toBe(true);
    expect(isSyntheticAvailability("synthetic_projection")).toBe(true);
  });
});

// src/helpers/slot-logic.ts

import { IAppointment } from "@/types/appointments-type";

export function getAvailableSlots(
  dayWorkingHours: { startTime: string; endTime: string } | null,
  existingAppointments: IAppointment[],
  serviceDuration: number,
) {
  if (!dayWorkingHours) return [];

  const slots = [];
  let current = parseTime(dayWorkingHours.startTime);
  const end = parseTime(dayWorkingHours.endTime);

  while (current + serviceDuration <= end) {
    const timeString = formatTime(current);

    // Provera da li se ovaj slot preklapa sa nekim postojećim terminom
    const isBusy = existingAppointments.some((app) => {
      const appStart = parseTime(app.time);
      const appEnd = appStart + (app.duration || 60);
      return current >= appStart && current < appEnd;
    });

    if (!isBusy) slots.push(timeString);
    current += 30; // Pomeraj od 30 minuta
  }
  return slots;
}

function parseTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function formatTime(m: number) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
}

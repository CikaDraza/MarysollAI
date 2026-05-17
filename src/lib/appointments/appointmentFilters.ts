import type { IAppointment } from "@/types/appointments-type";

export type AppointmentListMode = "all" | "can_cancel";

export type AppointmentFilterInput = Pick<
  Partial<IAppointment>,
  "status" | "date" | "time" | "createdAt" | "updatedAt" | "cancellationStatus"
>;

const ACTIVE_APPOINTMENT_STATUSES = new Set<IAppointment["status"]>([
  "pending",
  "appointment_approved",
  "appointment_rescheduled",
]);

function readTimestamp(value: unknown): number {
  if (!value) return 0;
  const timestamp = new Date(value as string | Date).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function scheduledTimestamp(appointment: AppointmentFilterInput): number {
  const date = typeof appointment.date === "string" ? appointment.date : "";
  const time = typeof appointment.time === "string" ? appointment.time : "";

  if (date && time) {
    const normalizedTime = /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time;
    const timestamp = readTimestamp(`${date}T${normalizedTime}`);
    if (timestamp) return timestamp;
  }

  return (
    readTimestamp(date) ||
    readTimestamp(appointment.updatedAt) ||
    readTimestamp(appointment.createdAt)
  );
}

export function isActiveAppointment(
  appointment: AppointmentFilterInput,
): boolean {
  return ACTIVE_APPOINTMENT_STATUSES.has(
    appointment.status as IAppointment["status"],
  );
}

export function isCancellableAppointment(
  appointment: AppointmentFilterInput,
): boolean {
  return (
    isActiveAppointment(appointment) &&
    appointment.cancellationStatus === "can_cancel"
  );
}

export function sortAppointmentsByScheduledDesc<T extends AppointmentFilterInput>(
  appointments: T[],
): T[] {
  return [...appointments].sort(
    (left, right) => scheduledTimestamp(right) - scheduledTimestamp(left),
  );
}

export function filterAppointmentsByMode<T extends AppointmentFilterInput>(
  appointments: T[],
  mode: AppointmentListMode = "all",
): T[] {
  const filtered =
    mode === "can_cancel"
      ? appointments.filter(isCancellableAppointment)
      : appointments;

  return sortAppointmentsByScheduledDesc(filtered);
}

// src/lib/availability/blockingStatuses.ts

export type AppointmentStatus =
  | "pending"
  | "appointment_approved"
  | "appointment_rejected"
  | "appointment_rescheduled"
  | "appointment_cancelled"
  | "completed"
  | "no_show";

export const APPOINTMENT_STATUS_VALUES: AppointmentStatus[] = [
  "pending",
  "appointment_approved",
  "appointment_rejected",
  "appointment_rescheduled",
  "appointment_cancelled",
  "completed",
  "no_show",
];

const BLOCKING_STATUSES = new Set<AppointmentStatus>([
  "pending",
  "appointment_approved",
  "appointment_rescheduled",
]);

export function isBlockingAppointmentStatus(status: string): boolean {
  return BLOCKING_STATUSES.has(status as AppointmentStatus);
}

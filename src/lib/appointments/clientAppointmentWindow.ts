import type { IAppointment } from "@/types/appointments-type";
import { isActiveAppointment, isCancellableAppointment } from "./appointmentFilters";

export interface ClientActionWindowState {
  canCancel: boolean;
  canUpdate: boolean;
  reason?: "expired" | "past" | "status_not_allowed";
  expiresAt?: string;
}

type AppointmentWindowInput = Pick<
  IAppointment,
  "status" | "cancellationStatus" | "date" | "time" | "createdAt" | "updatedAt" | "appointmentReliability"
>;

export function canClientCancelAppointment(
  appointment: AppointmentWindowInput,
): boolean {
  return isCancellableAppointment(appointment);
}

export function canClientUpdateAppointment(
  appointment: AppointmentWindowInput,
): boolean {
  if (!isActiveAppointment(appointment)) return false;
  // Platform policy takes precedence when present.
  if (appointment.appointmentReliability) {
    return appointment.appointmentReliability.cancellationAllowed;
  }
  // Fall back to cancellation status — update and cancel share the same window.
  return appointment.cancellationStatus === "can_cancel";
}

export function getClientActionWindowState(
  appointment: AppointmentWindowInput,
): ClientActionWindowState {
  const terminalStatuses = new Set<IAppointment["status"]>([
    "appointment_cancelled",
    "appointment_rejected",
    "completed",
    "no_show",
  ]);

  if (terminalStatuses.has(appointment.status as IAppointment["status"])) {
    return { canCancel: false, canUpdate: false, reason: "status_not_allowed" };
  }

  if (!isActiveAppointment(appointment)) {
    return { canCancel: false, canUpdate: false, reason: "past" };
  }

  const canCancel = canClientCancelAppointment(appointment);
  const canUpdate = canClientUpdateAppointment(appointment);

  return {
    canCancel,
    canUpdate,
    reason: !canCancel && !canUpdate ? "expired" : undefined,
    expiresAt: appointment.appointmentReliability?.cancellationDeadline,
  };
}

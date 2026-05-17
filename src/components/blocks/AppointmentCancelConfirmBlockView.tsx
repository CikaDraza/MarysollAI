"use client";

import { AppointmentCancelConfirmBlockType } from "@/types/landing-block";
import { formatISODate } from "@/helpers/formatISODate";
import { useAuthActions } from "@/hooks/useAuthActions";
import { useCancelAppointment } from "@/hooks/useAppointmentActions";

interface Props {
  block: AppointmentCancelConfirmBlockType;
}

export default function AppointmentCancelConfirmBlockView({ block }: Props) {
  const { token } = useAuthActions();
  const cancelAppointment = useCancelAppointment(token ?? undefined);
  const appointment = block.metadata.appointment;
  const appointmentId = block.metadata.appointmentId || appointment?._id;

  if (!appointment || !appointmentId) {
    return (
      <div className="my-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
        Termin nije pronađen. Izaberi termin iz liste.
      </div>
    );
  }

  const startsAt =
    appointment.date && appointment.time
      ? formatISODate(`${appointment.date}T${appointment.time}`)
      : "";

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-red-100 bg-white shadow-xl sm:max-w-xl">
      <div className="border-b border-gray-100 bg-red-50/60 px-5 py-4">
        <p className="text-sm font-semibold text-red-900">
          Potvrda otkazivanja
        </p>
      </div>
      <div className="space-y-4 p-5">
        <p className="text-sm font-semibold text-gray-900">
          Da li želite da otkažete termin za {appointment.serviceName}
          {startsAt ? ` ${startsAt}` : ""}?
        </p>
        <button
          type="button"
          onClick={() =>
            cancelAppointment.mutate({
              id: appointmentId,
              appointment,
              aiAssisted: true,
            })
          }
          disabled={cancelAppointment.isPending}
          className="inline-flex w-full items-center justify-center rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {cancelAppointment.isPending ? "Otkazujem..." : "Otkaži termin"}
        </button>
      </div>
    </div>
  );
}

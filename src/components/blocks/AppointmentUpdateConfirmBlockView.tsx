"use client";

import { AppointmentUpdateConfirmBlockType } from "@/types/landing-block";
import { formatISODate } from "@/helpers/formatISODate";
import { useAuthActions } from "@/hooks/useAuthActions";
import { useUpdateAppointment } from "@/hooks/useAppointmentActions";
import { sendSystemAction } from "@/lib/ai/events/systemActionDispatcher";

interface Props {
  block: AppointmentUpdateConfirmBlockType;
}

export default function AppointmentUpdateConfirmBlockView({ block }: Props) {
  const { token } = useAuthActions();
  const updateAppointment = useUpdateAppointment(token ?? undefined);
  const { appointmentId, currentAppointment, newDate, newTime, newSalonId, newServiceId } =
    block.metadata;

  if (!currentAppointment || !appointmentId) {
    return (
      <div className="my-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
        Termin nije pronađen. Izaberi termin iz liste.
      </div>
    );
  }

  const oldDateTime =
    currentAppointment.date && currentAppointment.time
      ? formatISODate(`${currentAppointment.date}T${currentAppointment.time}`)
      : "";
  const newDateTime = newDate && newTime ? formatISODate(`${newDate}T${newTime}`) : "";

  function handleConfirm() {
    updateAppointment.mutate(
      {
        id: appointmentId,
        payload: {
          date: newDate,
          time: newTime,
          ...(newSalonId ? { salonId: newSalonId } : {}),
          ...(newServiceId ? { serviceId: newServiceId } : {}),
        },
        appointment: currentAppointment,
        aiAssisted: false,
      },
      {
        onSuccess: () => {
          sendSystemAction({
            action: "APPOINTMENT_UPDATE_SUCCESS",
            source: "CalendarBlock",
            payload: { appointmentId, newDate, newTime },
            notifyAgent: false,
            visibleInThread: false,
          });
        },
        onError: () => {
          sendSystemAction({
            action: "APPOINTMENT_UPDATE_FAILED",
            source: "CalendarBlock",
            payload: { appointmentId },
            notifyAgent: false,
            visibleInThread: false,
          });
        },
      },
    );
  }

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-blue-100 bg-white shadow-xl sm:max-w-xl">
      <div className="border-b border-gray-100 bg-blue-50/60 px-5 py-4">
        <p className="text-sm font-semibold text-blue-900">Potvrda izmene termina</p>
      </div>
      <div className="space-y-4 p-5">
        <div className="space-y-1 text-sm text-gray-700">
          <p>
            <span className="font-medium text-gray-500">Usluga: </span>
            {currentAppointment.serviceName}
          </p>
          {oldDateTime && (
            <p>
              <span className="font-medium text-gray-500">Trenutni termin: </span>
              <span className="line-through text-gray-400">{oldDateTime}</span>
            </p>
          )}
          {newDateTime && (
            <p>
              <span className="font-medium text-gray-900">Novi termin: </span>
              <span className="font-semibold text-blue-700">{newDateTime}</span>
            </p>
          )}
        </div>

        <p className="text-sm font-semibold text-gray-900">
          Promeniti termin{oldDateTime ? ` sa ${oldDateTime}` : ""}
          {newDateTime ? ` na ${newDateTime}` : ""}?
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={updateAppointment.isPending}
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {updateAppointment.isPending ? "Menjam..." : "Potvrdi izmenu"}
          </button>
          <button
            type="button"
            onClick={() =>
              sendSystemAction({
                action: "APPOINTMENT_UPDATE_FAILED",
                source: "CalendarBlock",
                payload: { appointmentId, cancelled: true },
                notifyAgent: false,
                visibleInThread: false,
              })
            }
            disabled={updateAppointment.isPending}
            className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 sm:w-auto"
          >
            Odustani
          </button>
        </div>
      </div>
    </div>
  );
}

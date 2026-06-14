"use client";

import { Toaster } from "react-hot-toast";
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
  const {
    appointmentId,
    currentAppointment,
    newDate,
    newTime,
    newSalonId,
    newServiceId,
  } = block.metadata;

  if (!currentAppointment || !appointmentId) {
    return (
      <div className="my-4 rounded-xl border border-(--border-1) bg-(--surface-2) p-4 text-sm font-medium text-(--warning)">
        Termin nije pronađen. Izaberi termin iz liste.
      </div>
    );
  }

  const oldDateTime =
    currentAppointment.date && currentAppointment.time
      ? formatISODate(`${currentAppointment.date}T${currentAppointment.time}`)
      : "";
  const newDateTime =
    newDate && newTime ? formatISODate(`${newDate}T${newTime}`) : "";

  function handleConfirm() {
    // The platform reads the service from `services[0].serviceId` (an array)
    // and 400s without it — a flat `serviceId` is ignored. Reschedule keeps the
    // same service, so reuse the current appointment's services, overriding the
    // first id with the clean resolved id from the calendar. note/duration are
    // resent so the platform doesn't wipe them (it overwrites `note` with
    // undefined when the field is omitted).
    const services =
      currentAppointment.services && currentAppointment.services.length > 0
        ? currentAppointment.services.map((s, i) =>
            i === 0 && newServiceId ? { ...s, serviceId: newServiceId } : s,
          )
        : newServiceId
          ? [
              {
                serviceId: newServiceId,
                serviceName: currentAppointment.serviceName,
                quantity: 1,
                price: 0,
                duration: currentAppointment.duration ?? 0,
              },
            ]
          : [];

    updateAppointment.mutate(
      {
        id: appointmentId,
        payload: {
          date: newDate,
          time: newTime,
          services,
          serviceName: currentAppointment.serviceName,
          duration: currentAppointment.duration,
          ...(currentAppointment.note ? { note: currentAppointment.note } : {}),
          ...(newSalonId ? { salonId: newSalonId } : {}),
        },
        appointment: currentAppointment,
        // aiAssisted: true so useUpdateAppointment.onSuccess emits the
        // AGENT_RESPONSE chat event — otherwise the update succeeds but Claudia
        // stays silent (no in-thread confirmation). Mirrors the cancel flow.
        aiAssisted: true,
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
    <div className="mx-auto my-4 overflow-hidden rounded-xl border border-(--border-1) bg-(--surface-elev) text-(--fg-1) shadow-xl sm:max-w-xl">
      <Toaster position="top-center" />
      <div className="border-b border-(--border-1) bg-(--surface-2) px-5 py-4">
        <p className="text-sm font-semibold text-(--fg-1)">
          Potvrda izmene termina
        </p>
      </div>
      <div className="space-y-4 p-5">
        {updateAppointment.isError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-600">
            {updateAppointment.error instanceof Error &&
            updateAppointment.error.message
              ? updateAppointment.error.message
              : "Izmena nije uspela. Pokušajte ponovo ili izaberite drugi termin."}
          </div>
        )}
        <div className="space-y-1 text-sm text-(--fg-2)">
          <p>
            <span className="font-medium text-(--fg-3)">Usluga: </span>
            {currentAppointment.serviceName}
          </p>
          {oldDateTime && (
            <p>
              <span className="font-medium text-(--fg-3)">
                Trenutni termin:{" "}
              </span>
              <span className="line-through text-(--fg-3)">{oldDateTime}</span>
            </p>
          )}
          {newDateTime && (
            <p>
              <span className="font-medium text-(--fg-1)">Novi termin: </span>
              <span className="font-semibold text-(--secondary-color)">
                {newDateTime}
              </span>
            </p>
          )}
        </div>

        <p className="text-sm font-semibold text-(--fg-1)">
          Promeniti termin{oldDateTime ? ` sa ${oldDateTime}` : ""}
          {newDateTime ? ` na ${newDateTime}` : ""}?
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={updateAppointment.isPending}
            className="inline-flex items-center justify-center rounded-lg bg-(--secondary-color) px-4 py-3 text-sm font-semibold text-(--fg-on-brand) transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
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
            className="inline-flex items-center justify-center rounded-lg border border-(--border-2) px-4 py-3 text-sm font-semibold text-(--fg-2) transition hover:bg-(--surface-2) disabled:opacity-60 sm:w-auto"
          >
            Odustani
          </button>
        </div>
      </div>
    </div>
  );
}

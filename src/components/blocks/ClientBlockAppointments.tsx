"use client";
// blocks/ClientBlockAppointments.tsx
import { useEffect, useMemo, useState } from "react";
import { IAppointment } from "@/types/appointments-type";
import { useAppointmentsWithToken } from "@/hooks/useAppointmentsWithToken";
import { formatISODate } from "@/helpers/formatISODate";
import MiniLoader from "../MiniLoader";
import Paginator from "../Paginator";
import { useAuthActions } from "@/hooks/useAuthActions";
import { useCancelAppointment } from "@/hooks/useAppointmentActions";
import {
  AppointmentListMode,
  filterAppointmentsByMode,
  isCancellableAppointment,
} from "@/lib/appointments/appointmentFilters";

interface ClientAppointmentListItemProps {
  appointment: IAppointment;
  onCancel: (appointment: IAppointment) => void;
  onChange: (appointment: IAppointment) => void;
  isCancelling?: boolean;
}

function normalizeText(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeClientId(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (typeof record.$oid === "string") return record.$oid;
  const id = record._id ?? record.id;
  if (id && typeof id === "object") {
    return normalizeClientId(id);
  }
  return typeof id === "string" ? id : "";
}

function appointmentSalonId(appointment: IAppointment): string {
  const record = appointment as IAppointment & {
    salonId?: unknown;
    tenantId?: unknown;
  };
  return (
    normalizeClientId(record.salonId) || normalizeClientId(record.tenantId)
  );
}

function appointmentSalonName(appointment: IAppointment): string {
  const record = appointment as IAppointment & {
    salonName?: unknown;
    tenantName?: unknown;
  };
  return (
    (typeof record.salonName === "string" && record.salonName.trim()) ||
    (typeof record.tenantName === "string" && record.tenantName.trim()) ||
    "Salon"
  );
}

// AppointmentListItem deo
function ClientAppointmentListItem({
  appointment,
  onCancel,
  onChange,
  isCancelling,
}: ClientAppointmentListItemProps) {
  const currentAppointment = appointment;
  const canCancel = isCancellableAppointment(currentAppointment);
  const cancelExpired =
    currentAppointment.status !== "appointment_cancelled" &&
    currentAppointment.cancellationStatus === "late_cancel";

  const getStatusColor = (status: string) => {
    switch (status) {
      case "appointment_approved":
        return "bg-green-100 text-green-800";
      case "appointment_rejected":
        return "bg-red-100 text-red-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "appointment_rescheduled":
        return "bg-blue-100 text-blue-800";
      case "appointment_cancelled":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <li className="flex flex-col lg:flex-row justify-between gap-x-6 py-5 border-b border-gray-200">
      <div className="flex min-w-0 gap-x-4 flex-1">
        <div className="min-w-0 flex-auto">
          <div className="flex items-center gap-2">
            <p className="text-sm/6 font-semibold text-gray-900">
              {currentAppointment.clientName}
            </p>
            <span
              className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                currentAppointment.status,
              )}`}
            >
              {currentAppointment.status === "pending" && "Na čekanju"}
              {currentAppointment.status === "appointment_approved" &&
                "Odobreno"}
              {currentAppointment.status === "appointment_rejected" &&
                "Odbijeno"}
              {currentAppointment.status === "appointment_rescheduled" &&
                "Pomerano"}
              {currentAppointment.status === "appointment_cancelled" &&
                "Otkazano"}
              {currentAppointment.status === "completed" && "Završeno"}
              {currentAppointment.status === "no_show" && "Nije se pojavio"}
            </span>
          </div>
          <p className="mt-1 text-xs/5 text-gray-500">
            {currentAppointment.clientEmail}
          </p>
          {currentAppointment.note && (
            <p className="mt-2 text-xs text-gray-600">
              <strong>Napomena klijenta:</strong> {currentAppointment.note}
            </p>
          )}
          {currentAppointment.proposedDate &&
            currentAppointment.proposedTime && (
              <p className="mt-1 text-xs text-blue-600">
                <strong>Predloženi termin:</strong>{" "}
                {formatISODate(
                  currentAppointment.proposedDate +
                    "T" +
                    currentAppointment.proposedTime,
                )}
              </p>
            )}
          {currentAppointment.appointmentReliability?.cancellationDeadline && (
            <p className="mt-1 text-xs text-gray-500">
              Otkazivanje moguće do:{" "}
              {formatISODate(
                currentAppointment.appointmentReliability.cancellationDeadline,
              )}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        <p className="text-sm/6 font-semibold text-gray-900">
          {currentAppointment.serviceName.toUpperCase()}
        </p>
        <div className="mt-1 flex flex-col items-end gap-x-1.5">
          <p className="text-xs/5 text-gray-500">
            {`${
              currentAppointment.lastUpdatedBy === "client"
                ? "Klijent"
                : "Salon"
            } predložio termin`}
            :{" "}
            <time dateTime={currentAppointment.date}>
              {formatISODate(
                currentAppointment.date + "T" + currentAppointment.time,
              )}
            </time>
          </p>
        </div>
        {canCancel && (
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => onChange(currentAppointment)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:border-gray-300 hover:bg-gray-50"
            >
              Promeni termin
            </button>
            <button
              type="button"
              onClick={() => onCancel(currentAppointment)}
              disabled={isCancelling}
              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCancelling ? "Otkazujem..." : "Otkaži termin"}
            </button>
          </div>
        )}
        {!canCancel && cancelExpired && (
          <p className="mt-2 max-w-56 text-right text-xs font-medium text-amber-700">
            Vreme za otkazivanje termina je isteklo.
          </p>
        )}
      </div>
    </li>
  );
}

export default function ClientBlockAppointments({
  onAction,
  appointmentListMode = "all",
}: {
  onAction?: (query: string, payload?: Record<string, unknown>) => void;
  appointmentListMode?: AppointmentListMode;
}) {
  const [page, setPage] = useState(1);
  const [authChecked, setAuthChecked] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<IAppointment | null>(null);
  const [selectedSalonId, setSelectedSalonId] = useState("all");
  const [showSalonPicker, setShowSalonPicker] = useState(false);
  const {
    token,
    user,
    isLoading: isAuthLoading,
    ensureFreshAuth,
  } = useAuthActions();

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      await ensureFreshAuth();
      if (!cancelled) setAuthChecked(true);
    };

    void checkAuth();

    return () => {
      cancelled = true;
    };
  }, [ensureFreshAuth]);

  const {
    data: response,
    isLoading,
    isError,
  } = useAppointmentsWithToken(token ?? "", {
    page,
    limit: 100,
    clientEmail: user?.email ?? "",
    enabled: authChecked && !!token,
  });
  const cancelAppointment = useCancelAppointment(token ?? undefined);

  const userAppointments = useMemo(() => {
    const all = response?.appointments || [];
    if (!user) return [];

    const userEmail = normalizeText(user.email);

    return all.filter((appointment) => {
      const appointmentEmail = normalizeText(appointment.clientEmail);
      return !!userEmail && appointmentEmail === userEmail;
    });
  }, [response, user]);

  const salonOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const appointment of userAppointments) {
      const salonId = appointmentSalonId(appointment);
      if (!salonId) continue;
      byId.set(salonId, appointmentSalonName(appointment));
    }
    return Array.from(byId, ([id, name]) => ({ id, name }));
  }, [userAppointments]);

  const appointments = useMemo(() => {
    const bySalon =
      selectedSalonId === "all"
        ? userAppointments
        : userAppointments.filter(
            (appointment) =>
              appointmentSalonId(appointment) === selectedSalonId,
          );
    return filterAppointmentsByMode(bySalon, appointmentListMode);
  }, [appointmentListMode, selectedSalonId, userAppointments]);

  const pagination = response?.pagination;

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const confirmCancel = () => {
    if (!cancelTarget?._id) return;
    cancelAppointment.mutate({
      id: cancelTarget._id,
      appointment: cancelTarget,
    });
    setCancelTarget(null);
  };

  const handleChangeAppointment = (appointment: IAppointment) => {
    if (!appointment._id) return;
    onAction?.(`Želim da promenim termin ${appointment._id}`, {
      intent: "update_appointment",
      appointmentId: appointment._id,
      appointment,
    });
  };

  if (isAuthLoading || !authChecked || (token && isLoading)) {
    return <MiniLoader />;
  }
  if (!token || !user) {
    return (
      <p className="text-center text-gray-500 py-8">
        Prijavite se da biste videli svoje termine.
      </p>
    );
  }
  if (isError) return <p>Greška pri učitavanju termina.</p>;

  return (
    <div className="space-y-6">
      {salonOptions.length > 1 && (
        <div className="flex flex-col gap-3 rounded-xl bg-gray-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-gray-800">
              {selectedSalonId === "all"
                ? "Svi saloni"
                : (salonOptions.find((salon) => salon.id === selectedSalonId)
                    ?.name ?? "Izabrani salon")}
            </p>
            <button
              type="button"
              onClick={() => setShowSalonPicker((value) => !value)}
              className="cursor-pointer text-xs font-semibold text-(--secondary-color) underline"
            >
              Promeni salon
            </button>
          </div>
          {showSalonPicker && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedSalonId("all");
                  setShowSalonPicker(false);
                }}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                  selectedSalonId === "all"
                    ? "bg-gray-900 text-white"
                    : "bg-white text-gray-700"
                }`}
              >
                Svi saloni
              </button>
              {salonOptions.map((salon) => (
                <button
                  key={salon.id}
                  type="button"
                  onClick={() => {
                    setSelectedSalonId(salon.id);
                    setShowSalonPicker(false);
                  }}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                    selectedSalonId === salon.id
                      ? "bg-gray-900 text-white"
                      : "bg-white text-gray-700"
                  }`}
                >
                  {salon.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {appointments.length === 0 ? (
        <p className="text-center text-gray-500 py-8">
          {appointmentListMode === "can_cancel"
            ? "Nemate termina koje trenutno možete da otkažete."
            : "Nemate zakazanih termina."}
        </p>
      ) : (
        <>
          <ul role="list" className="divide-y divide-gray-100">
            {appointments.map((appointment: IAppointment) => (
              <ClientAppointmentListItem
                key={appointment._id}
                appointment={appointment}
                onCancel={setCancelTarget}
                onChange={handleChangeAppointment}
                isCancelling={cancelAppointment.isPending}
              />
            ))}
          </ul>
          {cancelTarget && (
            <div
              className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 px-4"
              role="dialog"
              aria-modal="true"
            >
              <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
                <p className="text-sm font-semibold text-gray-900">
                  Da li želite da otkažete termin za {cancelTarget.serviceName}{" "}
                  {formatISODate(`${cancelTarget.date}T${cancelTarget.time}`)}?
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCancelTarget(null)}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700"
                  >
                    Ne
                  </button>
                  <button
                    type="button"
                    onClick={confirmCancel}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Otkaži termin
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Paginator */}
          {pagination && pagination.totalPages > 1 && (
            <Paginator
              pagination={pagination}
              onPageChange={handlePageChange}
            />
          )}
        </>
      )}
    </div>
  );
}

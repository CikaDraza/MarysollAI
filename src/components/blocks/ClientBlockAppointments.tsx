"use client";
// blocks/ClientBlockAppointments.tsx
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IAppointment } from "@/types/appointments-type";
import { useAppointmentsWithToken } from "@/hooks/useAppointmentsWithToken";
import { useSalons } from "@/hooks/useSalons";
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
import { createGoogleMapsLink, createGoogleMapsLinkFromAddress } from "@/lib/geo/maps";
import { hasGeoCoordinates } from "@/lib/geo/distance";
import { formatDistance } from "@/lib/utils/distance";
import type { MappedSalon } from "@/lib/mappers/salonMapper";

interface ClientAppointmentListItemProps {
  appointment: IAppointment;
  onCancel: (appointment: IAppointment) => void;
  onChange: (appointment: IAppointment) => void;
  isCancelling?: boolean;
  salonDirectory?: SalonDirectory;
}

interface SalonDirectory {
  byId: Map<string, MappedSalon>;
  byServiceId: Map<string, MappedSalon>;
  byServiceName: Map<string, MappedSalon | null>;
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

function readStringPath(value: unknown, path: string[]): string {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current.trim() : "";
}

function readPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function isGenericSalonName(value: string): boolean {
  return value.trim().toLowerCase() === "salon";
}

function buildSalonDirectory(salons: MappedSalon[]): SalonDirectory {
  const byId = new Map<string, MappedSalon>();
  const byServiceId = new Map<string, MappedSalon>();
  const byServiceName = new Map<string, MappedSalon | null>();
  for (const salon of salons) {
    const salonRecord = salon as MappedSalon & { _id?: unknown };
    for (const id of [
      normalizeClientId(salonRecord.id),
      normalizeClientId(salonRecord._id),
      normalizeClientId(salonRecord.tenantId),
    ]) {
      if (id) byId.set(id, salon);
    }
    for (const service of salon.services ?? []) {
      const serviceRecord = service as typeof service & { _id?: unknown };
      for (const serviceId of [
        normalizeClientId(serviceRecord.id),
        normalizeClientId(serviceRecord.rawId),
        normalizeClientId(serviceRecord._id),
      ]) {
        if (serviceId) byServiceId.set(serviceId, salon);
      }
      const serviceName = normalizeText(service.name);
      if (serviceName) {
        const existing = byServiceName.get(serviceName);
        byServiceName.set(
          serviceName,
          existing && existing !== salon ? null : existing ?? salon,
        );
      }
    }
  }
  return { byId, byServiceId, byServiceName };
}

function appointmentSalonIds(appointment: IAppointment): string[] {
  const record = appointment as IAppointment & {
    salonId?: unknown;
    tenantId?: unknown;
  };
  return [
    normalizeClientId(record.salonId),
    normalizeClientId(record.tenantId),
    normalizeClientId(readPath(record, ["salonId", "_id"])),
    normalizeClientId(readPath(record, ["salonId", "id"])),
    normalizeClientId(readPath(record, ["tenantId", "_id"])),
    normalizeClientId(readPath(record, ["tenantId", "id"])),
    normalizeClientId(readPath(record, ["salon", "_id"])),
    normalizeClientId(readPath(record, ["salon", "id"])),
    normalizeClientId(readPath(record, ["tenant", "_id"])),
    normalizeClientId(readPath(record, ["tenant", "id"])),
    normalizeClientId(readPath(record, ["salonProfile", "_id"])),
    normalizeClientId(readPath(record, ["salonProfile", "id"])),
    normalizeClientId(readPath(record, ["tenantProfile", "_id"])),
    normalizeClientId(readPath(record, ["tenantProfile", "id"])),
  ].filter((id, index, ids) => Boolean(id) && ids.indexOf(id) === index);
}

function appointmentServiceIds(appointment: IAppointment): string[] {
  const ids = appointment.services.flatMap((service) => [
    normalizeClientId(service.serviceId),
    normalizeClientId(readPath(service, ["serviceId", "_id"])),
    normalizeClientId(readPath(service, ["serviceId", "id"])),
  ]);
  return ids.filter((id, index) => Boolean(id) && ids.indexOf(id) === index);
}

function appointmentServiceNames(appointment: IAppointment): string[] {
  const names = [
    normalizeText(appointment.serviceName),
    ...appointment.services.map((service) => normalizeText(service.serviceName)),
  ];
  return names.filter((name, index) => Boolean(name) && names.indexOf(name) === index);
}

function appointmentSalonId(appointment: IAppointment): string {
  return appointmentSalonIds(appointment)[0] ?? "";
}

function directorySalonForAppointment(
  appointment: IAppointment,
  salonDirectory?: SalonDirectory,
): MappedSalon | undefined {
  if (!salonDirectory) return undefined;
  for (const id of appointmentSalonIds(appointment)) {
    const salon = salonDirectory.byId.get(id);
    if (salon) return salon;
  }
  for (const serviceId of appointmentServiceIds(appointment)) {
    const salon = salonDirectory.byServiceId.get(serviceId);
    if (salon) return salon;
  }
  for (const serviceName of appointmentServiceNames(appointment)) {
    const salon = salonDirectory.byServiceName.get(serviceName);
    if (salon) return salon;
  }
  return undefined;
}

function appointmentSalonName(
  appointment: IAppointment,
  salonDirectory?: SalonDirectory,
): string {
  const record = appointment as IAppointment & {
    salonName?: unknown;
    tenantName?: unknown;
  };
  const directoryName = directorySalonForAppointment(
    appointment,
    salonDirectory,
  )?.name?.trim();
  const candidates = [
    directoryName ?? "",
    typeof record.salonName === "string" ? record.salonName.trim() : "",
    typeof record.tenantName === "string" ? record.tenantName.trim() : "",
    readStringPath(record, ["salon", "name"]),
    readStringPath(record, ["tenant", "name"]),
    readStringPath(record, ["salonId", "name"]),
    readStringPath(record, ["tenantId", "name"]),
    readStringPath(record, ["salonProfile", "name"]),
    readStringPath(record, ["tenantProfile", "name"]),
    readStringPath(record, ["metadata", "salonName"]),
  ].filter(Boolean);

  return (
    candidates.find((name) => !isGenericSalonName(name)) ??
    candidates[0] ??
    "Salon"
  );
}

function appointmentSalonCity(
  appointment: IAppointment,
  salonDirectory?: SalonDirectory,
): string {
  const record = appointment as IAppointment & {
    city?: unknown;
    location?: { city?: unknown };
  };
  const directorySalon = directorySalonForAppointment(appointment, salonDirectory);
  return (
    directorySalon?.city?.trim() ||
    directorySalon?.location.city?.trim() ||
    (typeof appointment.salonCity === "string" && appointment.salonCity.trim()) ||
    (typeof record.city === "string" && record.city.trim()) ||
    (typeof record.location?.city === "string" && record.location.city.trim()) ||
    readStringPath(record, ["salon", "city"]) ||
    readStringPath(record, ["tenant", "city"]) ||
    readStringPath(record, ["salonProfile", "city"]) ||
    readStringPath(record, ["tenantProfile", "city"]) ||
    readStringPath(record, ["metadata", "salonCity"]) ||
    ""
  );
}

function appointmentSalonAddress(
  appointment: IAppointment,
  salonDirectory?: SalonDirectory,
): string {
  const record = appointment as IAppointment & {
    address?: unknown;
    location?: { address?: unknown; formattedAddress?: unknown };
  };
  return (
    (typeof appointment.salonAddress === "string" && appointment.salonAddress.trim()) ||
    (typeof record.address === "string" && record.address.trim()) ||
    (typeof record.location?.address === "string" && record.location.address.trim()) ||
    (typeof record.location?.formattedAddress === "string" && record.location.formattedAddress.trim()) ||
    ""
  );
}

function appointmentSalonSlug(
  appointment: IAppointment,
  salonDirectory?: SalonDirectory,
): string {
  const directorySalon = directorySalonForAppointment(appointment, salonDirectory);
  return directorySalon?.slug ?? "";
}

function appointmentMapsLink(
  appointment: IAppointment,
  salonDirectory?: SalonDirectory,
): string {
  if (appointment.mapsLink) return appointment.mapsLink;
  const coords = { lat: appointment.salonLat, lng: appointment.salonLng };
  if (hasGeoCoordinates(coords)) {
    return createGoogleMapsLink(coords.lat, coords.lng);
  }
  return createGoogleMapsLinkFromAddress(
    appointmentSalonAddress(appointment, salonDirectory),
    appointmentSalonCity(appointment, salonDirectory),
  );
}

function appointmentMatchesSelectedSalon(
  appointment: IAppointment,
  selectedSalonId: string,
  salonDirectory?: SalonDirectory,
): boolean {
  if (selectedSalonId === "all") return true;
  if (appointmentSalonId(appointment) === selectedSalonId) return true;
  const appointmentIds = appointmentSalonIds(appointment);
  if (appointmentIds.includes(selectedSalonId)) return true;
  const selectedSalon = salonDirectory?.byId.get(selectedSalonId);
  const directorySalon = directorySalonForAppointment(appointment, salonDirectory);
  return (
    directorySalon?.id === selectedSalonId ||
    directorySalon?.tenantId === selectedSalonId ||
    Boolean(selectedSalon && directorySalon === selectedSalon)
  );
}

// AppointmentListItem deo
function ClientAppointmentListItem({
  appointment,
  onCancel,
  onChange,
  isCancelling,
  salonDirectory,
}: ClientAppointmentListItemProps) {
  const currentAppointment = appointment;
  const canCancel = isCancellableAppointment(currentAppointment);
  const salonName = appointmentSalonName(currentAppointment, salonDirectory);
  const salonSlug = appointmentSalonSlug(currentAppointment, salonDirectory);
  const salonAddress = appointmentSalonAddress(currentAppointment, salonDirectory);
  const salonCity = appointmentSalonCity(currentAppointment, salonDirectory);
  const mapsLink = appointmentMapsLink(currentAppointment, salonDirectory);
  const distanceLabel = formatDistance(currentAppointment.distanceKm);
  const travelLabel = currentAppointment.travelMinutesEstimate
    ? `oko ${currentAppointment.travelMinutesEstimate} min`
    : "";
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
          <div className="mt-3 rounded-lg bg-gray-50 p-3">
            <p className="text-sm font-semibold text-gray-900">
              {salonSlug ? (
                <Link
                  href={`/salons/${salonSlug}`}
                  className="hover:text-(--secondary-color)"
                >
                  {salonName}
                </Link>
              ) : (
                salonName
              )}
            </p>
            {(salonAddress || salonCity) && (
              <p className="mt-1 text-xs text-gray-600">
                {salonAddress && <>Adresa: {salonAddress}</>}
                {salonAddress && salonCity ? ", " : ""}
                {salonCity}
              </p>
            )}
            {(distanceLabel || travelLabel || mapsLink) && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {(distanceLabel || travelLabel) && (
                  <span className="text-xs font-medium text-gray-500">
                    {[distanceLabel, travelLabel].filter(Boolean).join(" · ")}
                  </span>
                )}
                {mapsLink && (
                  <a
                    href={mapsLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:border-gray-300 hover:bg-white"
                  >
                    Prikaži mapu
                  </a>
                )}
              </div>
            )}
          </div>
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
  const { data: salonProfiles = [] } = useSalons(undefined, {
    enabled: authChecked && !!token,
  });
  const cancelAppointment = useCancelAppointment(token ?? undefined);

  const salonDirectory = useMemo(
    () => buildSalonDirectory(salonProfiles),
    [salonProfiles],
  );

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
    const byId = new Map<string, { id: string; name: string; city: string }>();
    for (const appointment of userAppointments) {
      const directorySalon = directorySalonForAppointment(
        appointment,
        salonDirectory,
      );
      const salonId = appointmentSalonId(appointment) || directorySalon?.id || "";
      if (!salonId) continue;
      byId.set(salonId, {
        id: salonId,
        name: appointmentSalonName(appointment, salonDirectory),
        city: appointmentSalonCity(appointment, salonDirectory),
      });
    }
    return Array.from(byId.values());
  }, [salonDirectory, userAppointments]);

  const appointments = useMemo(() => {
    const bySalon =
      selectedSalonId === "all"
        ? userAppointments
        : userAppointments.filter(
            (appointment) =>
              appointmentMatchesSelectedSalon(
                appointment,
                selectedSalonId,
                salonDirectory,
              ),
          );
    return filterAppointmentsByMode(bySalon, appointmentListMode);
  }, [appointmentListMode, salonDirectory, selectedSalonId, userAppointments]);

  const pagination = response?.pagination;

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const confirmCancel = () => {
    if (!cancelTarget?._id) return;
    // Batch 6 — pass aiAssisted: true so useCancelAppointment.onSuccess
    // emits the AGENT_RESPONSE chat event. Without this the cancel
    // succeeds but the chat goes silent — user has no in-thread
    // confirmation that the action happened.
    cancelAppointment.mutate({
      id: cancelTarget._id,
      appointment: cancelTarget,
      aiAssisted: true,
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
                : (() => {
                    const selectedSalon = salonOptions.find(
                      (salon) => salon.id === selectedSalonId,
                    );
                    return selectedSalon
                      ? [selectedSalon.name, selectedSalon.city]
                          .filter(Boolean)
                          .join(", ")
                      : "Izabrani salon";
                  })()}
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
                  <span className="block text-left leading-tight">
                    {salon.name}
                  </span>
                  {salon.city && (
                    <span className="mt-0.5 block text-left text-[11px] font-medium leading-tight opacity-70">
                      {salon.city}
                    </span>
                  )}
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
                salonDirectory={salonDirectory}
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

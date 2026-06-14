"use client";
// blocks/ClientBlockAppointments.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import toast, { Toaster } from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { IAppointment } from "@/types/appointments-type";
import { PaginationInfo } from "@/types";
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
} from "@/lib/appointments/appointmentFilters";
import {
  getClientActionWindowState,
  isClientActionWindowExpiredNow,
} from "@/lib/appointments/clientAppointmentWindow";
import { sendSystemAction } from "@/lib/ai/events/systemActionDispatcher";
import { createGoogleMapsLink, createGoogleMapsLinkFromAddress } from "@/lib/geo/maps";
import { hasGeoCoordinates } from "@/lib/geo/distance";
import { formatDistance } from "@/lib/utils/distance";
import type { MappedSalon } from "@/lib/mappers/salonMapper";

interface ClientAppointmentListItemProps {
  appointment: IAppointment;
  onCancel: (appointment: IAppointment) => void;
  onChange: (appointment: IAppointment) => void;
  isCancelling?: boolean;
  // Set once a click revealed the action window had actually expired — hides
  // the (stale) edit/cancel buttons and shows the expired note immediately.
  forceExpired?: boolean;
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
  forceExpired,
  salonDirectory,
}: ClientAppointmentListItemProps) {
  const currentAppointment = appointment;
  const actionWindow = getClientActionWindowState(currentAppointment);
  const canCancel = actionWindow.canCancel && !forceExpired;
  const canUpdate = actionWindow.canUpdate && !forceExpired;
  const salonName = appointmentSalonName(currentAppointment, salonDirectory);
  const salonSlug = appointmentSalonSlug(currentAppointment, salonDirectory);
  const salonAddress = appointmentSalonAddress(currentAppointment, salonDirectory);
  const salonCity = appointmentSalonCity(currentAppointment, salonDirectory);
  const mapsLink = appointmentMapsLink(currentAppointment, salonDirectory);
  const distanceLabel = formatDistance(currentAppointment.distanceKm);
  const travelLabel = currentAppointment.travelMinutesEstimate
    ? `oko ${currentAppointment.travelMinutesEstimate} min`
    : "";
  const windowExpired = actionWindow.reason === "expired" || Boolean(forceExpired);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "appointment_approved":
        return "bg-green-500/15 text-green-600";
      case "appointment_rejected":
        return "bg-red-500/15 text-red-600";
      case "pending":
        return "bg-yellow-500/15 text-yellow-600";
      case "appointment_rescheduled":
        return "bg-blue-500/15 text-blue-600";
      case "appointment_cancelled":
        return "bg-(--surface-3) text-(--fg-2)";
      default:
        return "bg-(--surface-3) text-(--fg-2)";
    }
  };

  return (
    <li className="flex flex-col lg:flex-row justify-between gap-x-6 py-5 border-b border-(--border-1)">
      <div className="flex min-w-0 gap-x-4 flex-1">
        <div className="min-w-0 flex-auto">
          <div className="flex items-center gap-2">
            <p className="text-sm/6 font-semibold text-(--fg-1)">
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
          <p className="mt-1 text-xs/5 text-(--fg-3)">
            {currentAppointment.clientEmail}
          </p>
          {currentAppointment.note && (
            <p className="mt-2 text-xs text-(--fg-2)">
              <strong>Napomena klijenta:</strong> {currentAppointment.note}
            </p>
          )}
          <div className="mt-3 w-fit max-w-full rounded-lg bg-(--surface-2) p-3">
            <p className="text-sm font-semibold text-(--fg-1)">
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
              <p className="mt-1 text-xs text-(--fg-2)">
                {salonAddress && <>Adresa: {salonAddress}</>}
                {salonAddress && salonCity ? ", " : ""}
                {salonCity}
              </p>
            )}
            {(distanceLabel || travelLabel || mapsLink) && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {(distanceLabel || travelLabel) && (
                  <span className="text-xs font-medium text-(--fg-3)">
                    {[distanceLabel, travelLabel].filter(Boolean).join(" · ")}
                  </span>
                )}
                {mapsLink && (
                  <a
                    href={mapsLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-(--border-1) px-3 py-2 text-xs font-semibold text-(--fg-2) hover:border-(--border-2) hover:bg-(--surface-2)"
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
            <p className="mt-1 text-xs text-(--fg-3)">
              Otkazivanje moguće do:{" "}
              {formatISODate(
                currentAppointment.appointmentReliability.cancellationDeadline,
              )}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        <p className="text-sm/6 font-semibold text-(--fg-1)">
          {currentAppointment.serviceName.toUpperCase()}
        </p>
        <div className="mt-1 flex flex-col items-end gap-x-1.5">
          <p className="text-xs/5 text-(--fg-3)">
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
        {(canUpdate || canCancel) && (
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            {canUpdate && (
              <button
                type="button"
                onClick={() => onChange(currentAppointment)}
                className="rounded-lg border border-(--border-1) px-3 py-2 text-xs font-semibold text-(--fg-2) hover:border-(--border-2) hover:bg-(--surface-2)"
              >
                Izmeni termin
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                onClick={() => onCancel(currentAppointment)}
                disabled={isCancelling}
                className="rounded-lg border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-600 hover:border-red-500/50 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCancelling ? "Otkazujem..." : "Otkaži termin"}
              </button>
            )}
          </div>
        )}
        {windowExpired && (
          <p className="mt-2 max-w-56 text-right text-xs font-medium text-amber-600">
            Vreme za izmenu i otkazivanje termina je isteklo.
          </p>
        )}
      </div>
    </li>
  );
}

const PAGE_SIZE = 6;

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
  // Appointment ids whose action window was found expired on click — hides the
  // stale edit/cancel buttons immediately without waiting for a refetch.
  const [expiredIds, setExpiredIds] = useState<Set<string>>(new Set());
  const listTopRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Live deadline re-check on click. Marks the appointment expired (hides
  // buttons), refreshes the list, and tells the user the period passed —
  // matching the platform, which 400s once the window closes.
  const guardActionWindow = (appointment: IAppointment, kind: "izmenu" | "otkazivanje"): boolean => {
    if (!isClientActionWindowExpiredNow(appointment)) return false;
    if (appointment._id) {
      setExpiredIds((prev) => new Set(prev).add(appointment._id as string));
    }
    toast.error(`Vreme za ${kind} termina je isteklo.`);
    void queryClient.invalidateQueries({ queryKey: ["appointments-client"] });
    return true;
  };
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

  // Klijentska paginacija nad već filtriranom + sortiranom listom (6 po strani).
  // Server vraća tenant podatke drugim sortom, pa response.pagination ne odgovara prikazu.
  const totalCount = appointments.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedAppointments = appointments.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const clientPagination: PaginationInfo = {
    page: safePage,
    limit: PAGE_SIZE,
    totalCount,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPrevPage: safePage > 1,
  };

  // Reset na prvu stranicu kad se promene filteri (salon / mod prikaza).
  useEffect(() => {
    setPage(1);
  }, [selectedSalonId, appointmentListMode]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    // Posle promene strane vrati pogled na vrh liste — kraća strana inače
    // ostavi viewport na sledećoj sekciji pa deluje kao da je blok nestao.
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const confirmCancel = () => {
    if (!cancelTarget?._id) return;
    const targetId = cancelTarget._id;
    // Batch 6 — pass aiAssisted: true so useCancelAppointment.onSuccess
    // emits the AGENT_RESPONSE chat event. Without this the cancel
    // succeeds but the chat goes silent — user has no in-thread
    // confirmation that the action happened.
    cancelAppointment.mutate(
      { id: targetId, appointment: cancelTarget, aiAssisted: true },
      {
        // Catch-all when the server rejects because the window closed after the
        // button was rendered: hide the stale buttons. The hook already toasts.
        onError: (error) => {
          if (/isteklo|expired/i.test(String((error as Error)?.message ?? ""))) {
            setExpiredIds((prev) => new Set(prev).add(targetId));
          }
        },
      },
    );
    setCancelTarget(null);
  };

  const handleCancelClick = (appointment: IAppointment) => {
    if (guardActionWindow(appointment, "otkazivanje")) return;
    setCancelTarget(appointment);
  };

  const handleChangeAppointment = (appointment: IAppointment) => {
    if (!appointment._id) return;
    if (guardActionWindow(appointment, "izmenu")) return;
    // appendAssistantMessage is intentionally NOT called here — it modifies
    // claudia.thread synchronously which causes unifiedThread to rebuild,
    // potentially clearing commandBlock before it renders (race condition).
    // The reschedule block banner provides sufficient context to the user.
    //
    // Razreši salon/uslugu istim helperima koje koristi i prikaz — sirovi
    // appointment.salonId/salonCity/services[].serviceId su često prazni ili
    // ugnježdeni objekti. Bez ovoga reschedule kalendar padne na missingFields
    // → recovery "Nedostaje salon" → Claudia "Izaberi salon".
    const directorySalon = directorySalonForAppointment(appointment, salonDirectory);
    // Prefer the directory-resolved id: it's the exact id /api/salons used to
    // successfully fetch services + working hours, and that
    // /marketplace/services?salonId= recognizes. The raw appointment id is
    // often a tenantId / nested object, so it must be a fallback — not first.
    const salonId =
      directorySalon?.id ||
      appointmentSalonId(appointment) ||
      directorySalon?.tenantId ||
      "";
    sendSystemAction({
      action: "APPOINTMENT_UPDATE_REQUESTED",
      source: "ClientAppointmentsBlock",
      payload: {
        appointmentId: appointment._id,
        appointment,
        salonId,
        salonName: appointmentSalonName(appointment, salonDirectory),
        salonCity: appointmentSalonCity(appointment, salonDirectory),
        serviceId: appointmentServiceIds(appointment)[0] ?? "",
        serviceName:
          appointment.serviceName || appointment.services?.[0]?.serviceName || "",
      },
      notifyAgent: false,
      visibleInThread: false,
    });
  };

  if (isAuthLoading || !authChecked || (token && isLoading)) {
    return <MiniLoader />;
  }
  if (!token || !user) {
    return (
      <p className="text-center text-(--fg-3) py-8">
        Prijavite se da biste videli svoje termine.
      </p>
    );
  }
  if (isError) return <p>Greška pri učitavanju termina.</p>;

  return (
    <div ref={listTopRef} className="scroll-mt-4 space-y-6">
      <Toaster position="top-center" />
      {salonOptions.length > 1 && (
        <div className="flex flex-col gap-3 rounded-xl bg-(--surface-2) p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-(--fg-1)">
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
                    ? "bg-(--secondary-color) text-white"
                    : "bg-(--surface) text-(--fg-2)"
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
                      ? "bg-(--secondary-color) text-white"
                      : "bg-(--surface) text-(--fg-2)"
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
        <p className="text-center text-(--fg-3) py-8">
          {appointmentListMode === "can_cancel"
            ? "Nemate termina koje trenutno možete da otkažete."
            : "Nemate zakazanih termina."}
        </p>
      ) : (
        <>
          <ul role="list" className="divide-y divide-(--border-1)">
            {pagedAppointments.map((appointment: IAppointment) => (
              <ClientAppointmentListItem
                key={appointment._id}
                appointment={appointment}
                onCancel={handleCancelClick}
                onChange={handleChangeAppointment}
                isCancelling={cancelAppointment.isPending}
                forceExpired={
                  appointment._id ? expiredIds.has(appointment._id) : false
                }
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
              <div className="w-full max-w-md rounded-xl bg-(--surface) p-6 shadow-xl">
                <p className="text-sm font-semibold text-(--fg-1)">
                  Da li želite da otkažete termin za {cancelTarget.serviceName}{" "}
                  {formatISODate(`${cancelTarget.date}T${cancelTarget.time}`)}?
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCancelTarget(null)}
                    className="rounded-lg border border-(--border-1) px-4 py-2 text-sm font-semibold text-(--fg-2)"
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
          {/* Paginator — skriva se sam kad je totalPages <= 1 */}
          <Paginator
            pagination={clientPagination}
            onPageChange={handlePageChange}
          />
        </>
      )}
    </div>
  );
}

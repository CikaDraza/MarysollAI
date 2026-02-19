// blocks/ClientBlockAppointments.tsx
import { useMemo, useState } from "react";
import { IAppointment } from "@/types/appointments-type";
import { useAppointments } from "@/hooks/useAppointments";
import { formatISODate } from "@/helpers/formatISODate";
import MiniLoader from "../MiniLoader";
import Paginator from "../Paginator";
import { useAuth } from "@/hooks/context/AuthContext";

interface ClientAppointmentListItemProps {
  appointment: IAppointment;
}

// AppointmentListItem deo
function ClientAppointmentListItem({
  appointment,
}: ClientAppointmentListItemProps) {
  const currentAppointment = appointment;

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
      </div>
    </li>
  );
}

export default function ClientBlockAppointments() {
  const [page, setPage] = useState(1);
  const { user } = useAuth();

  // API poziv sa debounced vrednostima
  const {
    data: response,
    isLoading,
    isError,
  } = useAppointments({
    page,
    limit: 10,
    clientId: user?.id,
  });

  const appointments = useMemo(() => {
    return response?.appointments || [];
  }, [response]);

  const pagination = response?.pagination;

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  if (isLoading) return <MiniLoader />;
  if (isError) return <p>Greška pri učitavanju termina.</p>;

  return (
    <div className="space-y-6">
      {appointments.length === 0 ? (
        <p className="text-center text-gray-500 py-8">
          Nemate zakazanih termina.
        </p>
      ) : (
        <>
          <ul role="list" className="divide-y divide-gray-100">
            {appointments.map((appointment: IAppointment) => (
              <ClientAppointmentListItem
                key={appointment._id}
                appointment={appointment}
              />
            ))}
          </ul>
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

// blocks/CalendarBlockPreview.tsx
"use client";

import { useState, useMemo } from "react";
import { format, addDays, isSameDay } from "date-fns";
import { sr } from "date-fns/locale";
import { useAppointmentsWithToken } from "@/hooks/useAppointmentsWithToken";
import { useAuthActions } from "@/hooks/useAuthActions";
import { IAppointment } from "@/types/appointments-type";

interface Props {
  onSlotClick: (date: string, time: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Na čekanju",
  appointment_approved: "Odobreno",
  appointment_rejected: "Odbijeno",
  appointment_rescheduled: "Pomereno",
  appointment_cancelled: "Otkazano",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-50 border-yellow-200 text-yellow-700",
  appointment_approved: "bg-green-50 border-green-200 text-green-700",
  appointment_rejected: "bg-red-50 border-red-200 text-red-500",
  appointment_rescheduled: "bg-blue-50 border-blue-200 text-blue-700",
  appointment_cancelled: "bg-gray-50 border-gray-200 text-gray-400",
};

export function CalendarBlockPreview({ onSlotClick }: Props) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { token } = useAuthActions();

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const { data: response, isLoading } = useAppointmentsWithToken(token ?? "", {
    date: dateStr,
    limit: 100,
    enabled: !!token,
  });

  const days = useMemo(
    () => Array.from({ length: 14 }).map((_, i) => addDays(new Date(), i)),
    [],
  );

  const appointments: IAppointment[] = response?.appointments ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Date picker */}
      <div className="flex gap-2 overflow-x-auto p-2 mx-auto w-full snap-x scrollbar-hide scrollbar-custom">
        {days.map((day) => (
          <button
            key={day.toISOString()}
            onClick={() => setSelectedDate(day)}
            className={`cursor-pointer flex flex-col justify-center items-center shrink-0 w-16 h-20 min-w-15 p-3 mb-4 rounded-lg border transition-all ${
              isSameDay(day, selectedDate)
                ? "bg-(--secondary-color) border-(--secondary-color) text-white shadow-md scale-105"
                : "bg-white border-gray-100 text-gray-500 hover:border-gray-300"
            }`}
          >
            <span className="text-[10px] uppercase font-bold">
              {format(day, "EEE", { locale: sr })}
            </span>
            <span className="text-lg font-bold">{format(day, "d")}</span>
          </button>
        ))}
      </div>

      {/* Appointment list for selected day */}
      <div className="flex flex-col gap-2 max-h-72 overflow-y-auto px-1">
        {!token ? (
          <div className="py-10 text-center text-sm text-gray-400 bg-gray-50 rounded-2xl">
            Prijavite se da vidite vaše termine.
          </div>
        ) : isLoading ? (
          <div className="py-10 text-center text-sm text-gray-400">
            Učitavam termine...
          </div>
        ) : appointments.length === 0 ? (
          <div className="py-10 text-center col-span-3 text-sm text-gray-400 bg-gray-50 rounded-2xl">
            Nemate termina za ovaj dan.{" "}
            <button
              onClick={() => onSlotClick(dateStr, "09:00")}
              className="underline text-(--secondary-color) cursor-pointer bg-transparent border-none font-semibold"
            >
              Zakaži novi
            </button>
          </div>
        ) : (
          appointments.map((a) => (
            <div
              key={a._id}
              className={`flex items-center justify-between px-4 py-3 rounded-xl border text-sm ${
                STATUS_COLORS[a.status] ?? "bg-gray-50 border-gray-200 text-gray-600"
              }`}
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-bold">{a.time}</span>
                <span className="text-xs opacity-80">{a.serviceName}</span>
              </div>
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-white/60">
                {STATUS_LABELS[a.status] ?? a.status}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

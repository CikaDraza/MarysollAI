// blocks/CalendarBlockPreview.tsx
"use client";

import { useState, useMemo } from "react";
import { format, addDays, isSameDay, getDay } from "date-fns";
import { sr } from "date-fns/locale";
import { useAppointments } from "@/hooks/useAppointments";
import { useAuth } from "@/hooks/context/AuthContext";
import { useSalonProfile } from "@/hooks/useSalonProfile";

interface Props {
  onSlotClick: (date: string, time: string) => void;
}

export function CalendarBlockPreview({ onSlotClick }: Props) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { user } = useAuth();
  const { data: profile } = useSalonProfile();

  const workingHoursForDay = useMemo(() => {
    const dayNames = [
      "Nedelja",
      "Ponedeljak",
      "Utorak",
      "Sreda",
      "Četvrtak",
      "Petak",
      "Subota",
    ];

    const hoursSource = profile?.workingHours;

    if (!hoursSource) {
      return { isWorking: false, start: null, end: null };
    }

    const dayName = dayNames[getDay(selectedDate)]; // npr. "Sreda"
    const timeRange = hoursSource[dayName];

    if (!timeRange) {
      return {
        dayName,
        isWorking: false,
        start: null,
        end: null,
      };
    }

    if (timeRange.includes(" - ")) {
      const [start, end] = timeRange.split(" - ");
      return {
        dayName,
        timeRange,
        isWorking: true,
        start: start.trim(),
        end: end.trim(),
      };
    }

    return { isWorking: false, start: null, end: null };
  }, [selectedDate, profile]);

  // 1. Fetch podataka za izabrani datum
  const { data: response, isLoading } = useAppointments({
    date: format(selectedDate, "yyyy-MM-dd"),
    limit: 100, // Uzimamo sve za taj dan
    clientId: user?.id,
  });

  // 2. Generisanje dana (narednih 7 dana)
  const days = useMemo(() => {
    return Array.from({ length: 14 }).map((_, i) => addDays(new Date(), i));
  }, []);

  // 3. Generisanje slotova (npr. od 09:00 do 20:00 na svakih 30 min)
  const timeSlots = useMemo(() => {
    const slots = [];
    for (let hour = 0; hour <= 23; hour++) {
      slots.push(`${hour.toString().padStart(2, "0")}:00`);
      slots.push(`${hour.toString().padStart(2, "0")}:30`);
    }
    return slots;
  }, []);

  // Provera da li je slot unutar radnog vremena
  const canBook = workingHoursForDay?.isWorking;

  function isTimeBetween(slot: string, start: string, end: string) {
    const toMins = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    return toMins(slot) >= toMins(start) && toMins(slot) < toMins(end);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Horizontalni Date Picker */}
      <div className="flex gap-2 overflow-x-auto p-2 mx-auto w-full snap-x scrollbar-hide scrollbar-custom">
        {days.map((day) => (
          <button
            key={day.toISOString()}
            onClick={() => setSelectedDate(day)}
            className={`cursor-pointer flex flex-col justify-center items-center shrink-0 w-16 h-20 min-w-15 p-3 mb-4 rounded-2xl border transition-all ${
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

      {/* Grid sa terminima */}
      <div className="grid grid-cols-3 gap-2 max-h-75 overflow-y-auto p-1">
        {!canBook ? (
          <div className="py-10 text-center col-span-3 text-sm text-red-400 bg-gray-50 rounded-2xl">
            Salon ne radi ovim danom.
          </div>
        ) : (
          <>
            {isLoading ? (
              <div className="col-span-3 py-10 text-center text-sm text-gray-400">
                Učitavam termine...
              </div>
            ) : (
              timeSlots.map((slot) => {
                // Provera da li je slot unutar radnog vremena
                const isOutside = !isTimeBetween(
                  slot,
                  workingHoursForDay.start!,
                  workingHoursForDay.end!,
                );
                const appointment = response?.appointments.find(
                  (a) => a.time === slot,
                );
                const isTaken = !!appointment;
                const isMine = appointment?.clientId === user?.id;
                if (isOutside) return null;
                return (
                  <button
                    key={slot}
                    disabled={isTaken && !isMine}
                    onClick={() =>
                      !isTaken &&
                      onSlotClick(format(selectedDate, "yyyy-MM-dd"), slot)
                    }
                    className={`cursor-pointer py-3 rounded-xl text-xs font-bold border transition-all ${
                      isMine
                        ? "bg-purple-100 border-purple-300 text-purple-700 ring-2 ring-purple-200" // Tvoj termin
                        : isTaken
                          ? "bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed opacity-50" // Tuđ termin
                          : "bg-white border-gray-100 text-gray-700 hover:border-(--secondary-color) hover:text-(--secondary-color)" // Slobodno
                    }`}
                  >
                    {slot}
                    {isMine && (
                      <span className="block text-[8px] uppercase">
                        Tvoj termin
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </>
        )}
      </div>
      {/* Legenda */}
      <div className="flex justify-between items-center px-2 py-3 bg-gray-50 rounded-2xl border border-gray-100">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-white border border-gray-300"></div>
          <span className="text-[10px] font-medium text-gray-600">
            Slobodno
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-gray-300"></div>
          <span className="text-[10px] font-medium text-gray-600">Zauzeto</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-purple-600"></div>
          <span className="text-[10px] font-medium text-gray-500">
            Tvoj termin
          </span>
        </div>
      </div>
    </div>
  );
}

// blocks/CalendarBlockPreview.tsx
"use client";

import { useState, useMemo } from "react";
import { format, addDays, isSameDay } from "date-fns";
import { sr } from "date-fns/locale";
import { useAppointments } from "@/hooks/useAppointments";
import { useAuth } from "@/hooks/context/AuthContext";

interface Props {
  onSlotClick: (date: string, time: string) => void;
}

export function CalendarBlockPreview({ onSlotClick }: Props) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { user } = useAuth();

  // 1. Fetch podataka za izabrani datum
  const { data: response, isLoading } = useAppointments({
    date: format(selectedDate, "yyyy-MM-dd"),
    limit: 100, // Uzimamo sve za taj dan
  });

  // 2. Generisanje dana (narednih 7 dana)
  const days = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => addDays(new Date(), i));
  }, []);

  // 3. Generisanje slotova (npr. od 09:00 do 20:00 na svakih 30 min)
  const timeSlots = useMemo(() => {
    const slots = [];
    for (let hour = 9; hour <= 20; hour++) {
      slots.push(`${hour.toString().padStart(2, "0")}:00`);
      slots.push(`${hour.toString().padStart(2, "0")}:30`);
    }
    return slots;
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/* Horizontalni Date Picker */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mx-auto">
        {days.map((day) => (
          <button
            key={day.toISOString()}
            onClick={() => setSelectedDate(day)}
            className={`cursor-pointer flex flex-col items-center min-w-15 p-3 rounded-2xl border transition-all ${
              isSameDay(day, selectedDate)
                ? "bg-(--secondary-color) border-(--secondary-color) text-white shadow-md"
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
        {isLoading ? (
          <div className="col-span-3 py-10 text-center text-sm text-gray-400">
            Učitavam termine...
          </div>
        ) : (
          timeSlots.map((slot) => {
            const appointment = response?.appointments.find(
              (a) => a.time === slot,
            );
            const isTaken = !!appointment;
            const isMine = appointment?.clientId === user?.id;

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
                  <span className="block text-[8px] uppercase">Tvoj</span>
                )}
              </button>
            );
          })
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

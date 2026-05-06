// blocks/CalendarBlockPreview.tsx
"use client";

import { useState, useMemo } from "react";
import { format, addDays, isSameDay } from "date-fns";
import { sr } from "date-fns/locale";
import { useSalons } from "@/hooks/useSalons";
import { useSlots } from "@/hooks/useSlots";
import { useBookingModal } from "@/context/landing/BookingModalContext";
import type { MappedSalon } from "@/lib/mappers/salonMapper";

interface Props {
  onSlotClick: (date: string, time: string) => void;
}

export function CalendarBlockPreview({ onSlotClick }: Props) {
  const [selectedSalon, setSelectedSalon] = useState<MappedSalon | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { openModal } = useBookingModal();

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const { data: salons = [], isLoading: salonsLoading } = useSalons();

  const { data: slots = [], isLoading: slotsLoading } = useSlots({
    salonId: selectedSalon?.id ?? "",
    date: dateStr,
  });

  const days = useMemo(
    () => Array.from({ length: 14 }).map((_, i) => addDays(new Date(), i)),
    [],
  );

  // ── No salon selected: show salon picker ──────────────────────────────────
  if (!selectedSalon) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
          Izaberite salon
        </p>
        {salonsLoading ? (
          <div className="py-8 text-center text-sm text-gray-400">Učitavam salone…</div>
        ) : salons.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">Nema dostupnih salona.</div>
        ) : (
          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
            {salons.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSalon(s)}
                className="cursor-pointer flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 hover:bg-gray-100 border border-transparent hover:border-gray-200 text-left transition-all"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-bold text-gray-800">{s.name}</span>
                  {s.city && (
                    <span className="text-xs text-gray-400">{s.city}</span>
                  )}
                </div>
                {s.nextAvailableSlot && (
                  <span className="text-xs font-semibold text-(--secondary-color) bg-(--brand-50,#f3e8ff) px-2 py-1 rounded-full">
                    Slobodan termin
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Salon selected: date strip + slot grid ─────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {/* Salon header + change */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-bold text-gray-800">{selectedSalon.name}</span>
          {selectedSalon.city && (
            <span className="text-xs text-gray-400">{selectedSalon.city}</span>
          )}
        </div>
        <button
          onClick={() => setSelectedSalon(null)}
          className="cursor-pointer text-xs font-semibold text-(--secondary-color) underline bg-transparent border-none"
        >
          Promeni salon
        </button>
      </div>

      {/* Date strip */}
      <div className="flex gap-2 overflow-x-auto p-2 mx-auto w-full snap-x scrollbar-hide">
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

      {/* Slot grid */}
      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto px-1">
        {slotsLoading ? (
          <div className="py-8 text-center text-sm text-gray-400">Učitavam termine…</div>
        ) : slots.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400 bg-gray-50 rounded-2xl">
            Neradan dan — nema slobodnih termina.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {slots.map((slot) => {
              const time = slot.startTime.slice(11, 16);
              return (
                <button
                  key={slot.id}
                  onClick={() => {
                    openModal({
                      salonId: selectedSalon.id,
                      salonName: selectedSalon.name,
                      city: selectedSalon.city ?? "",
                      serviceId: slot.serviceId || null,
                      serviceName: "",
                      category: "",
                      startTime: slot.startTime,
                    });
                    onSlotClick(dateStr, time);
                  }}
                  className="cursor-pointer flex flex-col items-center justify-center py-3 px-2 rounded-xl bg-gray-50 hover:bg-(--secondary-color) hover:text-white border border-transparent hover:border-(--secondary-color) transition-all text-sm font-bold text-gray-700"
                >
                  {time}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

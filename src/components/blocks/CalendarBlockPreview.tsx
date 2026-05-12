// blocks/CalendarBlockPreview.tsx
"use client";

import { useState, useMemo, useEffect } from "react";
import {
  format,
  isSameDay,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  getDay,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
} from "date-fns";
import { sr } from "date-fns/locale";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { useSalons } from "@/hooks/useSalons";
import { useSlots } from "@/hooks/useSlots";
import { useServices } from "@/hooks/useServices";
import { useBookingModal } from "@/context/landing/BookingModalContext";
import type { MappedSalon } from "@/lib/mappers/salonMapper";
import { bookingFlow } from "@/lib/ai/booking-flow-state";
import { trackSearchEvent } from "@/lib/search/searchAnalytics";

// ─── Working-hours helpers ────────────────────────────────────────────────────

const DAY_NAMES_SR = [
  "Nedelja",
  "Ponedeljak",
  "Utorak",
  "Sreda",
  "Četvrtak",
  "Petak",
  "Subota",
];

function toMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m ?? 0);
}

function getWorkingRange(
  workingHours: Record<string, string>,
  date: Date,
): { isWorking: boolean; start: string; end: string } {
  const dayName = DAY_NAMES_SR[getDay(date)];
  const range = workingHours[dayName ?? ""];
  if (!range) return { isWorking: false, start: "", end: "" };
  const [start, end] = range.split("-");
  if (!start || !end) return { isWorking: false, start: "", end: "" };
  return { isWorking: true, start, end };
}

function generateTimeSlots(start: string, end: string): string[] {
  const result: string[] = [];
  let cur = toMins(start);
  const endM = toMins(end);
  while (cur < endM) {
    result.push(
      `${Math.floor(cur / 60).toString().padStart(2, "0")}:${(cur % 60)
        .toString()
        .padStart(2, "0")}`,
    );
    cur += 30;
  }
  return result;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onSlotClick: (date: string, time: string) => void;
  onBookingSuccess?: () => void;
}

type ViewMode = "week" | "day";

// ─── Component ────────────────────────────────────────────────────────────────

export function CalendarBlockPreview({ onSlotClick, onBookingSuccess }: Props) {
  const [selectedSalon, setSelectedSalon] = useState<MappedSalon | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedServiceName, setSelectedServiceName] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [weekStart, setWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  const { openModal } = useBookingModal();

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const workingHours = selectedSalon?.workingHours ?? {};

  const { data: salons = [], isLoading: salonsLoading } = useSalons();

  const { data: services = [] } = useServices({
    salonId: selectedSalon?.id ?? "",
  });

  const { data: platformSlots = [], isLoading: slotsLoading } = useSlots({
    salonId: selectedSalon?.id ?? "",
    date: dateStr,
    serviceId: selectedServiceId || undefined,
  });

  // Reset service selection when salon changes
  useEffect(() => {
    setSelectedServiceId("");
    setSelectedServiceName("");
  }, [selectedSalon?.id]);

  // Week days grid
  const weekDays = useMemo(
    () =>
      eachDayOfInterval({
        start: weekStart,
        end: endOfWeek(weekStart, { weekStartsOn: 1 }),
      }),
    [weekStart],
  );

  // Determine available slots for the selected day
  const { isWorking, start: dayStart, end: dayEnd } = getWorkingRange(
    workingHours,
    selectedDate,
  );

  const workingTimeSlots = useMemo(
    () => (isWorking ? generateTimeSlots(dayStart, dayEnd) : []),
    [isWorking, dayStart, dayEnd],
  );

  const availableSlotTimes = useMemo(() => {
    const now = new Date();
    // Use platform slots when available; fall back to working-hours generated slots.
    // Fallback ensures slots appear even when the platform hasn't pre-generated them.
    const sourceTimes =
      platformSlots.length > 0
        ? platformSlots.map((s) => s.startTime.slice(11, 16))
        : workingTimeSlots;

    return sourceTimes.filter((time) => new Date(`${dateStr}T${time}`) > now);
  }, [platformSlots, workingTimeSlots, dateStr]);

  // ── Navigation label ────────────────────────────────────────────────────────
  const navLabel =
    viewMode === "week"
      ? `${format(weekStart, "d. MMM", { locale: sr })} – ${format(
          endOfWeek(weekStart, { weekStartsOn: 1 }),
          "d. MMM",
          { locale: sr },
        )}`
      : format(selectedDate, "EEEE, d. MMM", { locale: sr });

  // ── Salon picker ─────────────────────────────────────────────────────────────
  if (!selectedSalon) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
          Izaberite salon
        </p>
        {salonsLoading ? (
          <div className="py-8 text-center text-sm text-gray-400">
            Učitavam salone…
          </div>
        ) : salons.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">
            Nema dostupnih salona.
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
            {salons.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedSalon(s);
                  setViewMode("day");
                  setSelectedDate(new Date());
                  setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
                }}
                className="cursor-pointer flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 hover:bg-gray-100 border border-transparent hover:border-gray-200 text-left transition-all"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-bold text-gray-800">
                    {s.name}
                  </span>
                  {s.city && (
                    <span className="text-xs text-gray-400">{s.city}</span>
                  )}
                </div>
                {s.nextAvailableSlot && (
                  <span className="text-xs font-semibold text-(--secondary-color) bg-purple-50 px-2 py-1 rounded-full">
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

  // ── Main calendar ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">
      {/* Salon header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-bold text-gray-800">
            {selectedSalon.name}
          </span>
          {selectedSalon.city && (
            <span className="text-xs text-gray-400 ml-2">
              {selectedSalon.city}
            </span>
          )}
        </div>
        <button
          onClick={() => setSelectedSalon(null)}
          className="cursor-pointer text-xs font-semibold text-(--secondary-color) underline bg-transparent border-none"
        >
          Promeni salon
        </button>
      </div>

      {/* Toolbar: view toggle + nav */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {(["week", "day"] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              className={`cursor-pointer px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                viewMode === v
                  ? "bg-white text-(--secondary-color) shadow-sm"
                  : "text-gray-400 hover:text-gray-700"
              }`}
            >
              {v === "week" ? "Sedmica" : "Dan"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() =>
              viewMode === "week"
                ? setWeekStart((w) => subWeeks(w, 1))
                : setSelectedDate((d) => subDays(d, 1))
            }
            className="cursor-pointer p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition"
          >
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <span className="text-xs font-semibold text-gray-700 min-w-[110px] text-center capitalize">
            {navLabel}
          </span>
          <button
            onClick={() =>
              viewMode === "week"
                ? setWeekStart((w) => addWeeks(w, 1))
                : setSelectedDate((d) => addDays(d, 1))
            }
            className="cursor-pointer p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition"
          >
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Week view ─────────────────────────────────────────────────────────── */}
      {viewMode === "week" && (
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((day) => {
            const { isWorking: dayWorking } = getWorkingRange(workingHours, day);
            const isSelected = isSameDay(day, selectedDate);
            const isToday = isSameDay(day, new Date());
            const isPast = day < new Date(new Date().setHours(0, 0, 0, 0));

            return (
              <button
                key={day.toISOString()}
                onClick={() => {
                  if (!dayWorking || isPast) return;
                  setSelectedDate(day);
                  setViewMode("day");
                }}
                className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl border-2 transition min-h-[68px] ${
                  !dayWorking || isPast
                    ? "border-red-200 bg-red-50 cursor-default opacity-70"
                    : isSelected
                      ? "border-(--secondary-color) bg-(--secondary-color)/10 cursor-pointer"
                      : isToday
                        ? "border-amber-300 bg-amber-50 cursor-pointer hover:border-amber-400"
                        : "border-gray-200 bg-white cursor-pointer hover:border-(--secondary-color)/40 hover:bg-(--secondary-color)/5 shadow-sm"
                }`}
              >
                <span
                  className={`text-[9px] font-bold uppercase tracking-wide ${
                    !dayWorking || isPast
                      ? "text-red-300"
                      : isToday
                        ? "text-amber-500"
                        : "text-gray-400"
                  }`}
                >
                  {format(day, "EEE", { locale: sr })}
                </span>
                <span
                  className={`text-sm font-bold leading-none ${
                    !dayWorking || isPast
                      ? "text-red-300"
                      : isSelected
                        ? "text-(--secondary-color)"
                        : isToday
                          ? "text-amber-600"
                          : "text-gray-700"
                  }`}
                >
                  {format(day, "d")}
                </span>
                {!dayWorking || isPast ? (
                  <span className="text-[8px] text-red-400 font-semibold leading-tight">
                    Neradan
                  </span>
                ) : (
                  <span className="text-[8px] text-green-500 font-semibold leading-tight">
                    Slobodan
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Day view ──────────────────────────────────────────────────────────── */}
      {viewMode === "day" && (
        <div className="flex flex-col gap-3">
          {/* Service dropdown */}
          {services.length > 0 && (
            <select
              value={selectedServiceId}
              onChange={(e) => {
                const svc = services.find((s) => s._id === e.target.value);
                setSelectedServiceId(e.target.value);
                setSelectedServiceName(svc?.name ?? "");
              }}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-medium text-gray-700 focus:outline-none focus:border-(--secondary-color) transition-colors"
            >
              <option value="">Sve usluge</option>
              {services.map((svc) => (
                <option key={svc._id} value={svc._id}>
                  {svc.name}
                  {svc.basePrice || svc.price
                    ? ` — ${new Intl.NumberFormat("sr-Latn").format(
                        svc.basePrice ?? svc.price ?? 0,
                      )} RSD`
                    : ""}
                </option>
              ))}
            </select>
          )}

          {/* Slot grid */}
          {!isWorking ? (
            <div className="py-8 text-center text-sm text-gray-400 bg-red-50 rounded-2xl border-2 border-red-200">
              Neradan dan — nema slobodnih termina.
            </div>
          ) : slotsLoading ? (
            <div className="py-8 text-center text-sm text-gray-400">
              Učitavam termine…
            </div>
          ) : availableSlotTimes.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400 bg-gray-50 rounded-2xl">
              Nema slobodnih termina za ovaj dan.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto px-1">
              {availableSlotTimes.map((time) => {
                const platformSlot = platformSlots.find(
                  (s) => s.startTime.slice(11, 16) === time,
                );
                const startTime =
                  platformSlot?.startTime ?? `${dateStr}T${time}:00`;

                return (
                  <button
                    key={time}
                    onClick={() => {
                      // Phase 2 Task 10 — hydrate bookingFlow from slot pick so
                      // a follow-up Claudia turn inherits the full selection.
                      bookingFlow.get().collect({
                        salonId: selectedSalon.id,
                        salonName: selectedSalon.name,
                        city: selectedSalon.city ?? undefined,
                        service: selectedServiceName || undefined,
                        serviceId: selectedServiceId || undefined,
                        date: dateStr,
                        time,
                      });
                      // Phase 2.5B Task 6 — instrument slot click. Position is
                      // index in `availableSlotTimes`. Fallback level isn't
                      // available here (we generate slots from working hours),
                      // so report 0 — caller can refine when results come from
                      // a fallback search.
                      trackSearchEvent({
                        type: "search.result_click",
                        slotId: platformSlot?.id ?? `${dateStr}T${time}`,
                        salonId: selectedSalon.id,
                        serviceId: selectedServiceId || null,
                        position: availableSlotTimes.indexOf(time),
                        fallbackLevel: 0,
                        strategy: "calendar_preview",
                      });
                      openModal(
                        {
                          salonId: selectedSalon.id,
                          salonName: selectedSalon.name,
                          city: selectedSalon.city ?? "",
                          serviceId:
                            selectedServiceId ||
                            platformSlot?.serviceId ||
                            null,
                          serviceName: selectedServiceName,
                          category: "",
                          startTime,
                        },
                        onBookingSuccess,
                      );
                      onSlotClick(dateStr, time);
                    }}
                    className="cursor-pointer flex flex-col items-center justify-center gap-0.5 py-3 px-2 rounded-xl bg-gray-50 hover:bg-(--secondary-color) hover:text-white border border-transparent hover:border-(--secondary-color) transition-all text-sm font-bold text-gray-700"
                  >
                    {time}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

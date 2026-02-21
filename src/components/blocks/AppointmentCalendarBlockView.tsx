// src/components/blocks/AppointmentCalendarBlockView.tsx
"use client";

import { useEffect, useMemo, useRef } from "react";
import { AppointmentCalendarBlockType } from "@/types/landing-block";
import { useServices } from "@/hooks/useServices";
import { formatPriceToString } from "@/helpers/formatPrice";
import { useAuthActions } from "@/hooks/useAuthActions";
import { generateTimes } from "@/helpers/generateTimes";
import { useAIAppointment } from "@/hooks/useAIAppointment";
import { Toaster } from "react-hot-toast";
import { useSalonProfile } from "@/hooks/useSalonProfile";
import { getDay } from "date-fns";
import LoaderButton from "../LoaderButton";
import MiniLoader from "../MiniLoader";
import { Reveal } from "../motion/Reveal";

interface Props {
  block: AppointmentCalendarBlockType;
  onActionComplete?: (m: string) => void;
}

export default function AppointmentCalendarBlockView({
  block,
  onActionComplete,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { user } = useAuthActions();
  const { data: services = [], isLoading } = useServices({ query: "" });
  const { data: profile } = useSalonProfile();
  const timeOptions = useMemo(() => generateTimes(8, 20, 30), []);

  const { displayValues, setters, handleAIConfirm, isPending } =
    useAIAppointment({
      block,
      services,
      user,
      onSuccess: (msg) => onActionComplete?.(msg),
    });

  const {
    selectedService,
    activeVariant,
    selectedDate,
    selectedTime,
    isAiSuggested,
  } = displayValues;

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

  function isTimeBetween(slot: string, start: string, end: string) {
    const toMins = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    return toMins(slot) >= toMins(start) && toMins(slot) < toMins(end);
  }

  // FUNKCIJA ZA SKROL KOJA CILJA GLAVNI KONTEJNER
  const triggerGlobalScroll = () => {
    const mainContent = document.getElementById("main-content");
    if (mainContent && containerRef.current) {
      // Skrolujemo tako da ovaj blok dođe u vidno polje
      containerRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start", // "start" je bolje za velike blokove kao cenovnik
      });
    }
  };

  // 1. Skroluj čim podaci prestanu da se učitavaju
  useEffect(() => {
    if (!isLoading && services.length > 0) {
      // Mali delay da dozvolimo React-u da renderuje listu
      const timer = setTimeout(triggerGlobalScroll, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading, services.length]);

  if (isLoading)
    return (
      <div className="py-20 text-center">
        <MiniLoader text="Učitavanje cena" />
      </div>
    );

  if (services?.length === 0) return null;

  return (
    <div ref={containerRef} className="scroll-mt-20">
      <Reveal>
        <div className="bg-white rounded-3xl p-6 shadow-xl max-w-md mx-auto my-6">
          <Toaster position="top-right" />
          {/* AI Suggestion Alert */}
          {isAiSuggested && (
            <div className="bg-blue-50 p-4 rounded-xl mb-4 border border-blue-100 flex justify-between items-center">
              <p className="text-xs text-(--primary-color)">
                Maria: Unela sam podatke{" "}
                <strong>{selectedService?.name}</strong> u{" "}
                <strong>{selectedTime}</strong>
              </p>
              <button
                onClick={handleAIConfirm}
                className="cursor-pointer bg-(--secondary-color)/80 hover:bg-(--secondary-color) text-white px-3 py-1 rounded-lg text-xs font-bold"
              >
                {isPending ? <LoaderButton /> : "Potvrdi"}
              </button>
            </div>
          )}

          <div className="space-y-4">
            {/* Dropdown za uslugu */}
            <select
              value={displayValues.serviceId}
              onChange={(e) => setters.setServiceId(e.target.value)}
              className="cursor-pointer w-full p-3 bg-gray-50 hover:bg-gray-100 rounded-xl border-none text-sm"
            >
              <option value="">Izaberite uslugu</option>
              {services.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>

            {/* Variants Buttons */}
            {selectedService?.type === "variant" && (
              <div className="flex flex-wrap gap-2">
                {selectedService.variants?.map((v) => (
                  <button
                    key={v.name}
                    onClick={() => setters.setVariantName(v.name)}
                    className={`cursor-pointer px-4 py-2 rounded-xl text-sm transition ${
                      activeVariant?.name === v.name
                        ? "bg-gray-800 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            )}

            {/* Date & Time Grid */}
            <input
              type="date"
              value={selectedDate}
              min={new Date().toISOString().split("T")[0]}
              onChange={(e) => setters.setDate(e.target.value)}
              className="w-full p-3 bg-gray-50 hover:bg-gray-100 rounded-2xl border-none text-sm"
            />

            <div className="grid grid-cols-4 gap-2">
              {/* Ovde mapiraš tvoje timeOptions */}
              {timeOptions.map((t) => {
                // Provera radnog vremena
                const isOutside = workingHoursForDay?.isWorking
                  ? !isTimeBetween(
                      t,
                      workingHoursForDay.start!,
                      workingHoursForDay.end!,
                    )
                  : true;

                // Ako je van radnog vremena, preskoči render
                if (isOutside) return null;
                return (
                  <button
                    key={t}
                    onClick={() => setters.setTime(t)}
                    className={`cursor-pointer p-2 rounded-lg text-xs ${selectedTime === t ? "bg-pink-500 text-white" : "bg-gray-50 hover:bg-gray-100"}`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            {/* Footer info */}
            <div className="pt-4 border-t border-gray-200 flex justify-between items-center">
              <div className="text-xl font-black">
                {formatPriceToString(
                  activeVariant?.price || selectedService?.basePrice || 0,
                )}{" "}
                RSD
              </div>
              <button
                onClick={handleAIConfirm}
                disabled={isPending || !selectedTime}
                className="cursor-pointer px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-2xl font-bold disabled:opacity-30"
              >
                {isPending ? <LoaderButton /> : "Zakaži termin"}
              </button>
            </div>
          </div>
        </div>
      </Reveal>
    </div>
  );
}

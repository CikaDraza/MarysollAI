"use client";

import { useState } from "react";
import {
  BoltIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { useLandingUI } from "@/context/landing/LandingUIContext";
import { useBookingModal } from "@/context/landing/BookingModalContext";
import { useSearchContext } from "@/context/landing/SearchContext";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("sr-Latn", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(11, 16);
  }
}

export default function StickyOffer() {
  const { drawerOpen } = useLandingUI();
  const { modalSlot, openModal: onBook } = useBookingModal();
  const { bestSlot: slot } = useSearchContext();

  const visible = !drawerOpen && !modalSlot;
  const [minimized, setMinimized] = useState(false);

  if (!visible || !slot) return null;

  const time = formatTime(slot.startTime);
  const label = `${slot.serviceName} · ${slot.salonName}`;

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        aria-label="Proširi baner"
        className="fixed bottom-[22px] left-0 sm:left-[22px] z-40 inline-flex items-center gap-2 bg-[#111114] text-white rounded-full px-4 py-2.5 shadow-lg border-none cursor-pointer font-bold text-xs hover:opacity-85 transition-opacity"
      >
        <BoltIcon
          className="w-4 h-4 text-[var(--secondary-color)]"
          strokeWidth={1.5}
        />
        {time}
        <ChevronUpIcon className="w-3.5 h-3.5 text-[#c4b6c2]" strokeWidth={2} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-[22px] sm:left-[22px] z-40 flex items-center gap-3 bg-[#111114] text-white rounded-2xl px-4 py-3.5 shadow-lg max-w-full sm:max-w-[400px]">
      {/* Icon */}
      <div className="w-[38px] h-[38px] rounded-full bg-[var(--secondary-color)] flex items-center justify-center flex-shrink-0">
        <BoltIcon className="w-[18px] h-[18px] text-white" strokeWidth={1.5} />
      </div>

      {/* Text */}
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="font-bold text-[10px] tracking-[.14em] uppercase text-[#d57ed3]">
          Možeš već u {time}
        </span>
        <span className="font-semibold text-xs leading-relaxed text-white overflow-hidden text-ellipsis whitespace-nowrap">
          {label}
        </span>
      </div>

      {/* CTA + minimize */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => onBook(slot)}
          className="inline-flex items-center justify-center border-none cursor-pointer font-bold text-xs px-4 py-2 rounded-[10px] bg-[var(--secondary-color)] text-white shadow-[var(--shadow-brand)] whitespace-nowrap hover:bg-[var(--secondary-hover)] transition-colors"
        >
          Rezerviši
        </button>

        <button
          onClick={() => setMinimized(true)}
          aria-label="Smanji"
          className="bg-transparent border-none text-[#c4b6c2] cursor-pointer w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 hover:text-white transition-colors"
        >
          <ChevronDownIcon className="w-3.5 h-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

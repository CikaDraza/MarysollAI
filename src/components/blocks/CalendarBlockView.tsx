"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarBlockType } from "@/types/landing-block";
import { Reveal } from "../motion/Reveal";
import { CalendarIcon, ListBulletIcon } from "@heroicons/react/24/outline";
import ClientBlockAppointments from "./ClientBlockAppointments";
import { CalendarBlockPreview } from "./CalendarBlockPreview";

interface Props {
  block: CalendarBlockType;
  onAction: (query: string, payload?: Record<string, unknown>) => void;
}

export function CalendarBlockView({ block, onAction }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"preview" | "list">(
    block.metadata?.mode || "preview",
  );

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
    // Mali delay da dozvolimo React-u da renderuje listu
    const timer = setTimeout(triggerGlobalScroll, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div ref={containerRef} className="scroll-mt-20">
      <Reveal>
        <div className="bg-(--surface) rounded-xl shadow-xl overflow-hidden sm:max-w-xl md:max-w-4xl xl:max-w-full my-4">
          {/* Lite Header - Tanji i svedeniji */}
          <div className="flex bg-(--surface-2) p-1 gap-1">
            <button
              onClick={() => setView("preview")}
              className={`cursor-pointer flex-1 flex items-center hover:text-(--secondary-color)/90 justify-center gap-2 py-4 text-xs font-bold rounded-lg transition-all ${
                view === "preview"
                  ? "bg-(--surface-elev) text-(--secondary-color) shadow-sm"
                  : "text-(--fg-3)"
              }`}
            >
              <CalendarIcon className="size-4" />
              Kalendar
            </button>
            <button
              onClick={() => setView("list")}
              className={`cursor-pointer flex-1 flex items-center hover:text-(--secondary-color)/90 justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
                view === "list"
                  ? "bg-(--surface-elev) text-(--secondary-color) shadow-sm"
                  : "text-(--fg-3)"
              }`}
            >
              <ListBulletIcon className="size-4" />
              Moji Termini
            </button>
          </div>

          <div className="p-8 min-h-75">
            {view === "preview" ? (
              <CalendarBlockPreview />
            ) : (
              <ClientBlockAppointments
                onAction={onAction}
                appointmentListMode={block.metadata?.appointmentListMode || "all"}
              />
            )}
          </div>
        </div>
      </Reveal>
    </div>
  );
}

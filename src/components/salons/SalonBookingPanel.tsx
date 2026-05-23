"use client";

import Link from "next/link";
import { CalendarDaysIcon, ClockIcon } from "@heroicons/react/24/outline";
import { useBookingModal } from "@/context/landing/BookingModalContext";
import type { SalonPreview, SalonPreviewNextSlot } from "@/types/salon-preview";
import type { SearchResult } from "@/types/slots";

interface Props {
  salon: SalonPreview;
}

export default function SalonBookingPanel({ salon }: Props) {
  const { openModal } = useBookingModal();
  const slots = salon.nextSlots.slice(0, 6);

  return (
    <section className="rounded-[8px] bg-[#111114] p-5 text-white shadow-[var(--shadow-lg)] sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#d57ed3]">
            Booking
          </p>
          <h2 className="m-0 mt-1 text-2xl font-black">Zakaži termin</h2>
        </div>
        <Link
          href="/#booking-widget"
          className="inline-flex items-center justify-center gap-2 rounded-[8px] bg-white px-4 py-2.5 text-sm font-black text-[#111114] hover:opacity-90"
        >
          <CalendarDaysIcon className="h-4 w-4" />
          Pronađi termin
        </Link>
      </div>

      {slots.length > 0 ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {slots.map((slot) => {
            const service = salon.services.find(
              (item) => item.id === slot.serviceId,
            );
            return (
              <button
                key={`${slot.startTime}-${slot.serviceId ?? "slot"}`}
                type="button"
                onClick={() => openModal(toSearchResult(salon, slot))}
                className="cursor-pointer rounded-[8px] border border-white/10 bg-white/8 p-4 text-left transition-colors hover:bg-white/14"
              >
                <span className="flex items-center gap-2 text-sm font-black text-white">
                  <ClockIcon className="h-4 w-4 text-[#d57ed3]" />
                  {formatSlotTime(slot.startTime)}
                </span>
                <span className="mt-2 block text-sm font-semibold text-[#c4b6c2]">
                  {service?.name ?? "Termin u salonu"}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="m-0 mt-5 text-sm leading-6 text-[#c4b6c2]">
          Termine salona pronađite na stranici booking, preporučeni termini,
          pretragom ili pitaj Mariju.
        </p>
      )}
    </section>
  );
}

function formatSlotTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("sr-Latn", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function toSearchResult(
  salon: SalonPreview,
  slot: SalonPreviewNextSlot,
): SearchResult {
  const service = salon.services.find((item) => item.id === slot.serviceId);
  const start = new Date(slot.startTime);

  return {
    salonId: salon.id,
    salonName: salon.name,
    salonSlug: salon.slug,
    serviceId: service?.id ?? slot.serviceId,
    serviceName: service?.name ?? "Termin u salonu",
    category: service?.category ?? "",
    startTime: slot.startTime,
    city: salon.city ?? "",
    mapsLink: salon.mapsUrl,
    salonAddress: salon.street,
    salonLogo: salon.logo,
    salonLat: salon.lat,
    salonLng: salon.lng,
    price: service?.price,
    serviceDuration: service?.duration,
    endTime: undefined,
    dateLabel: Number.isNaN(start.getTime())
      ? ""
      : start.toLocaleDateString("sr-Latn", {
          day: "2-digit",
          month: "short",
        }),
    timeLabel: Number.isNaN(start.getTime())
      ? ""
      : start.toLocaleTimeString("sr-Latn", {
          hour: "2-digit",
          minute: "2-digit",
        }),
    relevanceScore: 1,
    fallbackLevel: 1,
  };
}

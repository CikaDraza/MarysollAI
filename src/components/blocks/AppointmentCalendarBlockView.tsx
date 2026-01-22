// src/components/blocks/AppointmentCalendarBlockView.tsx
"use client";

import React, { useState, useMemo } from "react";
import { AppointmentCalendarBlockType } from "@/types/landing-block";
import { useServices } from "@/hooks/useServices";
import { formatPriceToString } from "@/helpers/formatPrice";
import toast from "react-hot-toast";
import { useAuthActions } from "@/hooks/useAuthActions";
import { IAppointment, IAppointmentVariant } from "@/types/appointments-type";
import { generateTimes } from "@/helpers/generateTimes";
import { useAppointmentMutations } from "@/hooks/useAppointmentMutations";

interface Props {
  block: AppointmentCalendarBlockType;
  onActionComplete?: (m: string) => void;
}

export default function AppointmentCalendarBlockView({
  block,
  onActionComplete,
}: Props) {
  const { user } = useAuthActions();
  const { data: services = [] } = useServices({ query: "" });
  const { createAppointment } = useAppointmentMutations(user?.token);

  // 1. Osnovna stanja
  const [serviceId, setServiceId] = useState<string>(
    block.metadata?.properties?.serviceId || block.selectedServiceId || "",
  );
  const [selectedDate, setSelectedDate] = useState<string>(
    block.metadata?.properties?.date || new Date().toISOString().split("T")[0],
  );
  const [selectedTime, setSelectedTime] = useState<string>(
    block.metadata?.properties?.time || "",
  );

  // Čuvamo samo IME varijante koju je korisnik KLIKNUO.
  // Ako je null, uzećemo prvu po defaultu u izvedenom stanju.
  const [userSelectedVariantName, setUserSelectedVariantName] = useState<
    string | null
  >(null);

  // 2. Izvedena stanja (Derived State) - Ovo ne okida dodatne rendere
  const selectedService = useMemo(
    () => services.find((s) => s._id === serviceId),
    [services, serviceId],
  );

  const activeVariant = useMemo((): IAppointmentVariant | null => {
    if (
      !selectedService ||
      selectedService.type !== "variant" ||
      !selectedService.variants?.length
    ) {
      return null;
    }
    // Ako je korisnik kliknuo na nešto, nađi to. Ako nije, vrati prvu varijantu.
    if (userSelectedVariantName) {
      return (
        selectedService.variants.find(
          (v) => v.name === userSelectedVariantName,
        ) || selectedService.variants[0]
      );
    }
    return selectedService.variants[0];
  }, [selectedService, userSelectedVariantName]);

  const timeOptions = useMemo(() => generateTimes(8, 20, 30), []);

  // 3. Handler za promenu usluge - ovde resetujemo izbor varijante
  const handleServiceChange = (id: string) => {
    setServiceId(id);
    setUserSelectedVariantName(null); // Resetujemo korisnikov izbor jer je nova usluga
    setSelectedTime(""); // Resetujemo i vreme radi sigurnosti
  };

  const handleBooking = async () => {
    if (!user) return toast.error("Morate biti prijavljeni.");
    if (!selectedService || !selectedTime)
      return toast.error("Popunite sva polja.");

    const totalDuration =
      activeVariant?.duration || selectedService.duration || 60;
    const totalPrice = activeVariant?.price || selectedService.basePrice || 0;

    const appointmentPayload: IAppointment = {
      clientId: user.id,
      clientName: user.name,
      clientEmail: user.email,
      serviceName: `${selectedService.name}${activeVariant ? ` - ${activeVariant.name}` : ""}`,
      services: [
        {
          serviceId: selectedService._id,
          serviceName: selectedService.name,
          quantity: 1,
          price: totalPrice,
          duration: totalDuration,
          variants: activeVariant ? [activeVariant] : undefined,
        },
      ],
      duration: totalDuration,
      date: selectedDate,
      time: selectedTime,
      status: "pending",
      messages: [],
      adminNotified: true,
      clientNotified: false,
    };

    try {
      await createAppointment.mutateAsync(appointmentPayload);
      toast.success("Termin zakazan!");
      if (onActionComplete) onActionComplete("Zakazala sam termin.");
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : "Unknown AI error";
      toast.error("Greška." + " " + errorMessage);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-xl max-w-md mx-auto my-6">
      <div className="space-y-6">
        {/* Select Service */}
        {!block.selectedServiceId && (
          <select
            value={serviceId}
            onChange={(e) => handleServiceChange(e.target.value)}
            className="w-full p-3 bg-gray-50 rounded-2xl border-none text-sm"
          >
            <option value="">Izaberite uslugu</option>
            {services.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        )}

        {/* Variants Buttons */}
        {selectedService?.type === "variant" && (
          <div className="flex flex-wrap gap-2">
            {selectedService.variants?.map((v) => (
              <button
                key={v.name}
                onClick={() => setUserSelectedVariantName(v.name)}
                className={`px-4 py-2 rounded-xl text-sm transition ${
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
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-full p-3 bg-gray-50 rounded-2xl border-none text-sm"
        />

        <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto pr-2">
          {timeOptions.map((t) => (
            <button
              key={t}
              onClick={() => setSelectedTime(t)}
              className={`p-2 rounded-xl text-xs font-medium transition ${
                selectedTime === t
                  ? "bg-pink-500 text-white"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Footer info */}
        <div className="pt-4 border-t flex justify-between items-center">
          <div className="text-xl font-black">
            {formatPriceToString(
              activeVariant?.price || selectedService?.basePrice || 0,
            )}{" "}
            RSD
          </div>
          <button
            onClick={handleBooking}
            disabled={!selectedTime || createAppointment.isPending}
            className="px-6 py-3 bg-gray-900 text-white rounded-2xl font-bold disabled:opacity-30"
          >
            {createAppointment.isPending ? "..." : "Zakaži"}
          </button>
        </div>
      </div>
    </div>
  );
}

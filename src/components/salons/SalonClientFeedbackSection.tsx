"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import { useQueryClient } from "@tanstack/react-query";
import { useSalonClientFeedback } from "@/hooks/salons/useSalonClientFeedback";
import type { IAppointment } from "@/types/appointments-type";
import type { SalonPreview } from "@/types/salon-preview";
import SalonTestimonialForm from "./SalonTestimonialForm";
import SalonTestimonialsSection from "./SalonTestimonialsSection";

interface Props {
  salon: SalonPreview;
}

export default function SalonClientFeedbackSection({ salon }: Props) {
  const queryClient = useQueryClient();
  const {
    isLoggedIn,
    token,
    isLoading,
    reviewableAppointments,
    clientTestimonials,
  } = useSalonClientFeedback(salon);
  const [selectedAppointment, setSelectedAppointment] =
    useState<IAppointment | null>(null);

  if (!isLoggedIn) return null;

  const handleSuccess = () => {
    setSelectedAppointment(null);
    queryClient.invalidateQueries({ queryKey: ["client-testimonials"] });
    queryClient.invalidateQueries({ queryKey: ["appointments-client"] });
    queryClient.invalidateQueries({ queryKey: ["salon-testimonials", salon.slug] });
  };

  return (
    <section className="bg-[var(--surface-2)] py-14">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[var(--secondary-color)]">
              Klijent
            </p>
            <h2 className="m-0 mt-1 text-3xl font-black text-[var(--fg-1)]">
              Ostavite utisak
            </h2>
          </div>
        </div>

        {isLoading ? (
          <div className="h-24 animate-pulse rounded-[8px] bg-white" />
        ) : reviewableAppointments.length > 0 ? (
          <div className="grid gap-3">
            {reviewableAppointments.map((appointment) => (
              <div
                key={appointment._id}
                className="flex flex-col gap-3 rounded-[8px] border border-[var(--border-1)] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="m-0 text-sm font-black text-gray-900">
                    {appointment.serviceName}
                  </p>
                  <p className="m-0 mt-1 text-xs font-semibold text-gray-500">
                    {[appointment.date, appointment.time].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAppointment(appointment)}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-[8px] bg-[var(--primary-color)] px-4 py-2 text-sm font-black text-white hover:bg-[var(--secondary-color)]"
                >
                  <ChatBubbleLeftRightIcon className="h-4 w-4" />
                  Ostavi utisak
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="m-0 rounded-[8px] bg-white p-4 text-sm font-semibold text-[var(--fg-2)] shadow-sm">
            Nema završenih termina za koje je moguće ostaviti novi utisak.
          </p>
        )}

        <AnimatePresence>
          {selectedAppointment && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -8 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0, y: -8 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="mt-5">
                <SalonTestimonialForm
                  appointment={selectedAppointment}
                  token={token}
                  onSuccess={handleSuccess}
                  onCancel={() => setSelectedAppointment(null)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <SalonTestimonialsSection
        testimonials={clientTestimonials}
        averageRating={averageRating(clientTestimonials)}
        headline="Moji utisci"
        emptyCopy="Još niste ostavili utisak za ovaj salon."
      />
    </section>
  );
}

function averageRating(testimonials: { rating: number }[]) {
  if (testimonials.length === 0) return null;
  return (
    Math.round(
      (testimonials.reduce((sum, testimonial) => sum + testimonial.rating, 0) /
        testimonials.length) *
        10,
    ) / 10
  );
}

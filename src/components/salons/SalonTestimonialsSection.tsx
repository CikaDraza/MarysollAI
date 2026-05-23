"use client";

import { StarIcon, UserIcon } from "@heroicons/react/24/solid";
import { Navigation, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import type { PublicSalonTestimonial } from "@/types/salon-preview";

interface Props {
  testimonials: PublicSalonTestimonial[];
  averageRating: number | null;
  headline?: string;
  emptyCopy?: string;
}

export default function SalonTestimonialsSection({
  testimonials,
  averageRating,
  headline,
  emptyCopy,
}: Props) {
  if (testimonials.length === 0) {
    return (
      <section className="py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <h2 className="m-0 text-4xl font-black text-[var(--fg-1)] lg:text-5xl">
            {headline || "Zadovoljni klijenti"}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[var(--fg-2)]">
            {emptyCopy ?? "Utisci za ovaj salon će biti prikazani čim ih klijenti podele."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-12 text-center">
          <h2 className="m-0 text-5xl font-bold text-black lg:text-6xl">
            {headline || "Zadovoljni klijenti"}
          </h2>
          {averageRating != null && (
            <p className="mt-4 text-sm font-bold text-gray-500">
              Prosečna ocena {averageRating.toFixed(1)} od 5
            </p>
          )}
        </div>

        <Swiper
          modules={[Navigation, Pagination]}
          navigation={testimonials.length > 1}
          pagination={testimonials.length > 1 ? { clickable: true } : false}
          slidesPerView={1}
          spaceBetween={24}
          breakpoints={{
            768: { slidesPerView: Math.min(testimonials.length, 2) },
            1024: { slidesPerView: Math.min(testimonials.length, 3) },
          }}
          className="pb-12"
        >
          {testimonials.map((testimonial) => (
            <SwiperSlide key={testimonial._id} className="h-auto">
              <TestimonialCard testimonial={testimonial} />
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </section>
  );
}

function TestimonialCard({
  testimonial,
}: {
  testimonial: PublicSalonTestimonial;
}) {
  return (
    <div className="h-full rounded-[8px] bg-white p-6 shadow-sm ring-1 ring-gray-100">
      <div className="mb-3 flex gap-1">
        {Array.from({ length: 5 }).map((_, index) => (
          <StarIcon
            key={index}
            className={`h-4 w-4 ${
              index < testimonial.rating
                ? "fill-yellow-400 text-yellow-400"
                : "text-gray-200"
            }`}
          />
        ))}
      </div>
      <p className="m-0 text-sm italic leading-6 text-gray-600">
        &ldquo;{testimonial.comment}&rdquo;
      </p>
      {testimonial.adminReply && (
        <div className="mt-3 rounded-[8px] border-l-2 border-[var(--primary-color)] bg-[var(--primary-color)]/10 p-3">
          <p className="m-0 text-xs leading-5 text-gray-600">
            <span className="font-semibold">Salon: </span>
            {testimonial.adminReply}
          </p>
        </div>
      )}
      <div className="mt-4 flex items-center gap-3 border-t border-gray-100 pt-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100">
          <UserIcon className="h-4 w-4 text-[var(--primary-color)]" />
        </div>
        <span className="text-sm font-semibold text-gray-700">
          {testimonial.clientName}
        </span>
      </div>
    </div>
  );
}

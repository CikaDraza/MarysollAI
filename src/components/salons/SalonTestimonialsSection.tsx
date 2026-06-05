"use client";

import { useState } from "react";
import { StarIcon } from "@heroicons/react/24/solid";
import type { PublicSalonTestimonial } from "@/types/salon-preview";

const INITIAL_VISIBLE = 6;
const LOAD_STEP = 10;

interface Props {
  testimonials: PublicSalonTestimonial[];
  averageRating: number | null;
  headline?: string;
  emptyCopy?: string;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDate(value: string | Date): string {
  try {
    return new Date(value).toLocaleDateString("sr-RS", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export default function SalonTestimonialsSection({
  testimonials,
  averageRating,
  headline,
  emptyCopy,
}: Props) {
  const [visible, setVisible] = useState(INITIAL_VISIBLE);

  if (testimonials.length === 0) {
    return (
      <section className="py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <h2 className="m-0 text-4xl font-black text-[var(--fg-1)] lg:text-5xl">
            {headline || "Utisci klijenata"}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[var(--fg-2)]">
            {emptyCopy ??
              "Utisci za ovaj salon će biti prikazani čim ih klijenti podele."}
          </p>
        </div>
      </section>
    );
  }

  const shown = testimonials.slice(0, visible);
  const remaining = testimonials.length - shown.length;

  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-12 text-center">
          <h2 className="m-0 text-5xl font-bold text-black lg:text-6xl">
            {headline || "Utisci klijenata"}
          </h2>
          {averageRating != null && (
            <p className="mt-4 text-sm font-bold text-gray-500">
              Prosečna ocena {averageRating.toFixed(1)} od 5 ·{" "}
              {testimonials.length}{" "}
              {testimonials.length === 1 ? "utisak" : "utisaka"}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {shown.map((testimonial) => (
            <TestimonialCard key={testimonial._id} testimonial={testimonial} />
          ))}
        </div>

        {remaining > 0 && (
          <div className="mt-10 text-center">
            <button
              type="button"
              onClick={() => setVisible((v) => v + LOAD_STEP)}
              className="inline-flex items-center justify-center rounded-full border border-[var(--border-1)] bg-[var(--surface)] px-6 py-3 text-sm font-bold text-[var(--fg-1)] transition-colors hover:border-[var(--secondary-color)] hover:text-[var(--secondary-color)]"
            >
              Pogledaj više utisaka ({remaining})
            </button>
          </div>
        )}
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
    <div className="flex h-full flex-col rounded-[8px] bg-white p-6 shadow-sm ring-1 ring-gray-100">
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
      <p className="m-0 flex-1 text-sm italic leading-6 text-gray-600">
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
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-[var(--primary-color)]">
          {initials(testimonial.clientName) || "?"}
        </div>
        <span className="text-sm font-semibold text-gray-700">
          {testimonial.clientName}
        </span>
        {testimonial.createdAt && (
          <span className="ml-auto text-xs font-medium text-gray-400">
            {formatDate(testimonial.createdAt)}
          </span>
        )}
      </div>
    </div>
  );
}

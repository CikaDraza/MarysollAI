"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useTestimonialActions } from "@/hooks/useTestimonialActions";
import type { IAppointment } from "@/types/appointments-type";

interface Props {
  appointment: IAppointment;
  token: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function SalonTestimonialForm({
  appointment,
  token,
  onSuccess,
  onCancel,
}: Props) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const { createTestimonial } = useTestimonialActions(token);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!appointment._id) return;

    createTestimonial.mutate(
      {
        appointmentId: appointment._id,
        rating,
        comment,
      },
      {
        onSuccess: () => {
          setComment("");
          setRating(5);
          onSuccess?.();
        },
      },
    );
  };

  return (
    <form
      id="testimonial-form"
      onSubmit={handleSubmit}
      className="rounded-[8px] border border-gray-200 bg-white p-6 shadow-sm"
    >
      <h3 className="mb-4 text-lg font-semibold text-gray-900">
        Ostavite komentar za termin: {appointment.serviceName}
      </h3>

      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Ocena:
        </label>
        <div className="flex space-x-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              className="cursor-pointer text-3xl transition-transform hover:scale-110 focus:outline-none"
              aria-label={`${star} zvezdica`}
            >
              {star <= rating ? (
                <span className="text-yellow-400">★</span>
              ) : (
                <span className="text-gray-300">☆</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Komentar:
        </label>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Podelite svoje iskustvo sa nama..."
          className="w-full rounded-[8px] border border-gray-300 p-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
          rows={4}
          required
          minLength={10}
        />
        <p className="mt-1 text-xs text-gray-500">Minimalno 10 karaktera</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={createTestimonial.isPending || comment.length < 10}
          className="cursor-pointer rounded-[8px] bg-[var(--primary-color)] px-6 py-2 font-semibold text-white transition-colors hover:bg-[var(--secondary-color)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {createTestimonial.isPending ? "Slanje..." : "Pošalji komentar"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-[8px] bg-gray-200 px-6 py-2 text-gray-900 transition-colors hover:bg-gray-300"
          >
            Otkaži
          </button>
        )}
      </div>
    </form>
  );
}

"use client";

import BookingModal from "@/components/landing/BookingModal";
import {
  BookingModalProvider,
} from "@/context/landing/BookingModalContext";
import { LandingUIProvider } from "@/context/landing/LandingUIContext";
import { useSalonPreview } from "@/hooks/salons/useSalonPreview";
import { useSalonTestimonials } from "@/hooks/salons/useSalonTestimonials";
import SalonAppointmentsBlock from "./SalonAppointmentsBlock";
import SalonBookingPanel from "./SalonBookingPanel";
import SalonClientFeedbackSection from "./SalonClientFeedbackSection";
import SalonGallerySwiper from "./SalonGallerySwiper";
import SalonHero from "./SalonHero";
import SalonInfoGrid from "./SalonInfoGrid";
import SalonTestimonialsSection from "./SalonTestimonialsSection";

interface Props {
  slug: string;
}

export default function SalonPreviewPage({ slug }: Props) {
  return (
    <LandingUIProvider>
      <BookingModalProvider>
        <SalonPreviewContent slug={slug} />
        <BookingModal />
      </BookingModalProvider>
    </LandingUIProvider>
  );
}

function SalonPreviewContent({ slug }: Props) {
  const {
    data: salon,
    isLoading: salonLoading,
    isError: salonError,
  } = useSalonPreview(slug);
  const {
    data: testimonials,
    isLoading: testimonialsLoading,
  } = useSalonTestimonials(slug, Boolean(salon));

  if (salonLoading) {
    return (
      <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6">
        <div className="h-[520px] animate-pulse rounded-[8px] bg-[var(--surface)] shadow-[var(--shadow-sm)]" />
      </main>
    );
  }

  if (salonError || !salon) {
    return (
      <main className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4 py-16 sm:px-6">
        <div className="max-w-lg rounded-[8px] border border-[var(--border-1)] bg-[var(--surface)] p-6 text-center shadow-[var(--shadow-sm)]">
          <h1 className="m-0 text-2xl font-black text-[var(--fg-1)]">
            Salon nije pronađen
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--fg-2)]">
            Proveri link salona ili se vrati na Marysoll booking pretragu.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto max-w-7xl px-4 pb-12 sm:px-6">
        <SalonHero
          salon={salon}
          averageRating={testimonials?.averageRating ?? null}
          testimonialsTotal={testimonials?.total ?? 0}
        />
        <SalonGallerySwiper
          images={salon.galleryImages}
          salonName={salon.name}
        />
        <div className="mt-8 grid gap-8">
          <SalonBookingPanel salon={salon} />
          <SalonInfoGrid salon={salon} />
          <SalonAppointmentsBlock />
        </div>
      </div>

      <SalonClientFeedbackSection salon={salon} />

      {testimonialsLoading ? (
        <section className="py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4">
            <div className="h-60 animate-pulse rounded-[8px] bg-[var(--surface)]" />
          </div>
        </section>
      ) : (
        <SalonTestimonialsSection
          testimonials={testimonials?.testimonials ?? []}
          averageRating={testimonials?.averageRating ?? null}
        />
      )}
    </main>
  );
}

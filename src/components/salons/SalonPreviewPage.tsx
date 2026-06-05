"use client";

import BookingModal from "@/components/landing/BookingModal";
import {
  BookingModalProvider,
} from "@/context/landing/BookingModalContext";
import { LandingUIProvider } from "@/context/landing/LandingUIContext";
import { useSalonPreview } from "@/hooks/salons/useSalonPreview";
import { useSalonTestimonials } from "@/hooks/salons/useSalonTestimonials";
import { useSalonStats } from "@/hooks/salons/useSalonStats";
import SalonAppointmentsBlock from "./SalonAppointmentsBlock";
import SalonBookingPanel from "./SalonBookingPanel";
import SalonClientFeedbackSection from "./SalonClientFeedbackSection";
import SalonGallerySwiper from "./SalonGallerySwiper";
import SalonHero from "./SalonHero";
import SalonInfoGrid from "./SalonInfoGrid";
import SalonTestimonialsSection from "./SalonTestimonialsSection";
import SalonSocialProof from "./SalonSocialProof";
import { SalonJsonLd } from "./SalonJsonLd";

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
  const { data: stats } = useSalonStats(salon?.tenantId, Boolean(salon));

  // Rating source: prefer the stats endpoint (authoritative, approved-only), but
  // fall back to the testimonials shown on the page when stats has no rating —
  // so a salon with visible reviews never reads as "Novo".
  const statsHasRating =
    (stats?.reviewCount ?? 0) >= 1 && stats?.averageRating != null;
  const ratingValue = statsHasRating
    ? stats!.averageRating
    : (testimonials?.averageRating ?? null);
  const ratingCount = statsHasRating
    ? stats!.reviewCount
    : (testimonials?.total ?? 0);

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
        {/* Rating: stats endpoint when available, else the visible testimonials. */}
        <SalonJsonLd
          name={salon.name}
          slug={salon.slug ?? slug}
          city={salon.city}
          averageRating={ratingValue}
          reviewCount={ratingCount}
        />
        <SalonHero
          salon={salon}
          averageRating={ratingValue}
          testimonialsTotal={ratingCount}
        />
        <SalonSocialProof stats={stats} serviceCount={salon.services.length} />
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
        <div id="utisci" className="scroll-mt-20">
          <SalonTestimonialsSection
            testimonials={testimonials?.testimonials ?? []}
            averageRating={testimonials?.averageRating ?? null}
          />
        </div>
      )}
    </main>
  );
}

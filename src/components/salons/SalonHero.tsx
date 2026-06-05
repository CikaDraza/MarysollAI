"use client";

import Link from "next/link";
import { cloneElement } from "react";
import type { ReactElement, ReactNode } from "react";
import {
  EnvelopeIcon,
  GlobeAltIcon,
  MapPinIcon,
  PhoneIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { StarIcon } from "@heroicons/react/24/solid";
import type { SalonPreview } from "@/types/salon-preview";
import { utisakWord } from "@/lib/seo/serbianText";
import { CheckIcon } from "@heroicons/react/16/solid";

interface Props {
  salon: SalonPreview;
  averageRating: number | null;
  testimonialsTotal: number;
}

export default function SalonHero({
  salon,
  averageRating,
  testimonialsTotal,
}: Props) {
  const location = [salon.street, salon.city].filter(Boolean).join(", ");

  return (
    <section className="grid gap-8 py-8 lg:grid-cols-[1fr_360px] lg:py-10">
      <div>
        <Link
          href="/"
          className="mb-6 inline-flex text-sm font-bold text-[var(--secondary-color)] hover:text-[var(--secondary-hover)]"
        >
          Nazad na booking
        </Link>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          {salon.logo && (
            <img
              src={salon.logo}
              alt={`${salon.name} logo`}
              className="h-24 w-24 object-cover"
            />
          )}
          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-2">
              {salon.websiteUrl && (
                <Link
                  href={salon.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-[var(--secondary-color)] shadow-[var(--shadow-xs)] hover:text-[var(--secondary-hover)]"
                  aria-label="Sajt salona"
                >
                  <GlobeAltIcon className="h-4 w-4" />
                </Link>
              )}
            </div>

            <h1 className="m-0 text-[38px] font-black leading-[1.05] text-[var(--fg-1)] sm:text-[52px] lg:text-[64px]">
              {salon.name}
            </h1>

            {/* Rating sits directly below the H1, above the description. */}
            {averageRating != null && testimonialsTotal >= 1 ? (
              <Link
                href="#utisci"
                className="mt-4 inline-flex flex-wrap items-baseline gap-x-2.5 gap-y-1 no-underline"
              >
                <span className="inline-flex items-center gap-1.5 text-[22px] font-black text-[var(--fg-1)]">
                  <StarIcon className="h-5 w-5 text-yellow-400" />
                  {averageRating.toFixed(1)}
                  <span className="text-[16px] font-bold text-[var(--fg-3)]">
                    / 5
                  </span>
                </span>
                <span className="text-sm font-semibold text-[var(--fg-3)] underline-offset-2 hover:underline">
                  Na osnovu {testimonialsTotal} {utisakWord(testimonialsTotal)}{" "}
                  klijenata
                </span>
              </Link>
            ) : (
              <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-3 py-1.5 text-sm font-bold text-[var(--secondary-color)]">
                <CheckIcon className="h-4 w-4" />
                Marysoll verifikovan
              </span>
            )}

            {salon.description && (
              <p className="mt-5 max-w-3xl text-[17px] leading-8 text-[var(--fg-2)]">
                {salon.description}
              </p>
            )}
          </div>
        </div>
      </div>

      <aside className="self-start rounded-[8px] border border-[var(--border-1)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
        <h2 className="m-0 text-lg font-black text-[var(--fg-1)]">Kontakt</h2>
        <div className="mt-4 grid gap-3 text-sm font-semibold text-[var(--fg-2)]">
          {location && (
            <InfoLink href={salon.mapsUrl} icon={<MapPinIcon />}>
              {location}
            </InfoLink>
          )}
          {salon.phone && (
            <InfoLink href={`tel:${salon.phone}`} icon={<PhoneIcon />}>
              {salon.phone}
            </InfoLink>
          )}
          {salon.email && (
            <InfoLink href={`mailto:${salon.email}`} icon={<EnvelopeIcon />}>
              {salon.email}
            </InfoLink>
          )}
        </div>
      </aside>
    </section>
  );
}

function InfoLink({
  href,
  icon,
  children,
}: {
  href?: string;
  icon: ReactElement<{ className?: string }>;
  children: ReactNode;
}) {
  const content = (
    <>
      {cloneIcon(icon)}
      <span className="min-w-0">{children}</span>
    </>
  );

  if (!href) {
    return <div className="flex items-start gap-3">{content}</div>;
  }

  return (
    <Link
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      className="flex items-start gap-3 transition-colors hover:text-[var(--secondary-color)]"
    >
      {content}
    </Link>
  );
}

function cloneIcon(icon: ReactElement<{ className?: string }>) {
  return cloneElement(icon, {
    className: "mt-0.5 h-4 w-4 shrink-0 text-[var(--secondary-color)]",
  });
}

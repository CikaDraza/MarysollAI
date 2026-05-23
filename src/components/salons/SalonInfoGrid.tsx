"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  AtSymbolIcon,
  ClockIcon,
  DevicePhoneMobileIcon,
  GlobeAltIcon,
  MapIcon,
  MegaphoneIcon,
} from "@heroicons/react/24/outline";
import type { SalonPreview } from "@/types/salon-preview";

interface Props {
  salon: SalonPreview;
}

const dayOrder = [
  "Ponedeljak",
  "Utorak",
  "Sreda",
  "Četvrtak",
  "Petak",
  "Subota",
  "Nedelja",
];

export default function SalonInfoGrid({ salon }: Props) {
  const workingHourEntries = Object.entries(salon.workingHours).sort(
    ([a], [b]) => {
      const ai = dayOrder.indexOf(a);
      const bi = dayOrder.indexOf(b);
      if (ai === -1 || bi === -1) return a.localeCompare(b);
      return ai - bi;
    },
  );
  const socialLinks = Object.entries(salon.social).filter(
    (entry): entry is [string, string] => Boolean(entry[1]),
  );

  return (
    <section className="grid gap-5 lg:grid-cols-3">
      <InfoCard title="Radno vreme" icon={<ClockIcon className="h-5 w-5" />}>
        {workingHourEntries.length > 0 ? (
          <div className="grid gap-2">
            {workingHourEntries.map(([day, hours]) => (
              <div
                key={day}
                className="flex items-center justify-between gap-4 text-sm"
              >
                <span className="font-semibold text-[var(--fg-2)]">{day}</span>
                <span className="font-black text-[var(--fg-1)]">{hours}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="m-0 text-sm leading-6 text-[var(--fg-2)]">
            Radno vreme će uskoro biti prikazano.
          </p>
        )}
      </InfoCard>

      <InfoCard title="Detalji salona" icon={<AtSymbolIcon className="h-5 w-5" />}>
        <InfoRow label="Email" value={salon.email} />
        <InfoRow label="Kontakt email" value={salon.contactEmail} />
        <InfoRow label="Telefon" value={salon.phone} />
        {salon.websiteUrl && (
          <InfoLinkRow
            label="Web site"
            href={salon.websiteUrl}
            icon={<GlobeAltIcon className="h-4 w-4" />}
          >
            {salon.websiteUrl.replace(/^https?:\/\//, "")}
          </InfoLinkRow>
        )}
        <InfoRow label="Marketing telefon" value={salon.marketingPhone} />
        <div className="mt-4 flex flex-wrap gap-2">
          {socialLinks.map(([name, href]) => (
            <Link
              key={name}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border-1)] px-3 py-1.5 text-xs font-black capitalize text-[var(--fg-2)] hover:border-[var(--secondary-color)] hover:text-[var(--secondary-color)]"
            >
              <MegaphoneIcon className="h-3.5 w-3.5" />
              {name}
            </Link>
          ))}
        </div>
      </InfoCard>

      <InfoCard title="Lokacija i mreže" icon={<MapIcon className="h-5 w-5" />}>
        <InfoRow label="Grad" value={salon.city} />
        <InfoRow label="Ulica" value={salon.street} />
        {salon.mapsUrl && (
          <Link
            href={salon.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-2 rounded-[8px] bg-[var(--secondary-color)] px-3 py-2 text-xs font-black text-white hover:bg-[var(--secondary-hover)]"
          >
            <DevicePhoneMobileIcon className="h-4 w-4" />
            Google mapa
          </Link>
        )}
      </InfoCard>
    </section>
  );
}

function InfoCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="rounded-[8px] border border-[var(--border-1)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
      <div className="mb-4 flex items-center gap-3 text-[var(--secondary-color)]">
        {icon}
        <h2 className="m-0 text-lg font-black text-[var(--fg-1)]">{title}</h2>
      </div>
      {children}
    </article>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="mb-3 last:mb-0">
      <p className="m-0 text-xs font-black uppercase tracking-[0.08em] text-[var(--fg-3)]">
        {label}
      </p>
      <p className="m-0 mt-1 break-words text-sm font-semibold text-[var(--fg-1)]">
        {value}
      </p>
    </div>
  );
}

function InfoLinkRow({
  label,
  href,
  icon,
  children,
}: {
  label: string;
  href: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="m-0 text-xs font-black uppercase tracking-[0.08em] text-[var(--fg-3)]">
        {label}
      </p>
      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex max-w-full items-center gap-2 break-all text-sm font-semibold text-[var(--secondary-color)] hover:text-[var(--secondary-hover)]"
      >
        {icon}
        <span>{children}</span>
      </Link>
    </div>
  );
}

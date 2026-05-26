import type { Metadata } from "next";
import Link from "next/link";
import EditorialTeaserSection from "@/components/editorial/EditorialTeaserSection";
import { getEditorialTeaserSections } from "@/lib/editorial/getEditorialTeasers";

export const metadata: Metadata = {
  title: "Beauty trendovi i saveti salona | Marysoll Booking",
  description:
    "Kratki editorial teaseri za beauty trendove, popularne tretmane i savete salona. Članci se otvaraju na kanonskim salon ili Marysoll URL-ovima.",
  robots: "index, follow",
  alternates: {
    canonical: "/blog",
  },
};

export default function BlogTeaserPage() {
  const sections = getEditorialTeaserSections();

  return (
    <main className="min-h-screen bg-[var(--background)] px-6 py-10 text-[var(--fg-1)]">
      <div className="mx-auto max-w-7xl">
        <nav className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="text-[14px] font-bold text-[var(--secondary-color)] transition hover:text-[var(--secondary-hover)]"
          >
            Marysoll Booking
          </Link>
          <Link
            href="/"
            className="rounded-full bg-[var(--surface)] px-4 py-2 text-[13px] font-bold text-[var(--fg-2)] shadow-[var(--shadow-xs)] transition hover:text-[var(--secondary-color)]"
          >
            Pretraga termina
          </Link>
        </nav>

        <header className="max-w-3xl py-14">
          <p className="m-0 text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--secondary-color)]">
            Beauty trendovi
          </p>
          <h1 className="mt-3 text-[38px] font-bold leading-tight text-[var(--fg-1)] sm:text-[48px]">
            Inspiracija pre izbora tretmana
          </h1>
          <p className="mt-5 text-[17px] leading-8 text-[var(--fg-2)]">
            Kratki pregledi iz salona i Marysoll vodiča. Puni tekstovi ostaju na
            kanonskim tenant ili Marysoll platform URL-ovima.
          </p>
        </header>

        <div className="space-y-6 pb-16">
          {sections.map((section) => (
            <EditorialTeaserSection key={section.title} {...section} />
          ))}
        </div>
      </div>
    </main>
  );
}

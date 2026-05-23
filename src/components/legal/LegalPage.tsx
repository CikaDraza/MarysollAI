import Link from "next/link";
import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import Logo from "@/components/landing/Logo";
import type { LegalPageContent } from "@/lib/legal/legalContent";

type Props = {
  content: LegalPageContent;
};

export default function LegalPage({ content }: Props) {
  const companion =
    content.slug === "terms"
      ? { href: "/privacy", label: "Politika privatnosti" }
      : { href: "/terms", label: "Uslovi korišćenja" };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--fg-1)]">
      <div className="border-b border-[var(--border-1)] bg-[var(--surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-5 py-4 sm:px-6">
          <Link
            href="/"
            className="inline-flex items-center text-[var(--primary-color)]"
            aria-label="Marysoll Booking"
          >
            <Logo width={128} />
          </Link>

          <nav className="flex items-center gap-2 text-[13px] font-bold">
            <Link
              href={companion.href}
              className="hidden rounded-[10px] px-3 py-2 text-[var(--fg-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--secondary-color)] sm:inline-flex"
            >
              {companion.label}
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--secondary-color)] px-3 py-2 text-white shadow-[var(--shadow-brand)] transition-colors hover:bg-[var(--secondary-hover)]"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Booking
            </Link>
          </nav>
        </div>
      </div>

      <main>
        <section className="border-b border-[var(--border-1)] bg-[var(--surface)]">
          <div className="mx-auto grid max-w-[1180px] gap-8 px-5 py-12 sm:px-6 lg:grid-cols-[1fr_330px] lg:py-16">
            <div className="max-w-[760px]">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--border-1)] bg-[var(--surface-2)] px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--secondary-color)]">
                <SparklesIcon className="h-4 w-4" />
                {content.eyebrow}
              </div>
              <h1 className="m-0 text-[34px] font-black leading-[1.08] text-[var(--fg-1)] sm:text-[44px] lg:text-[54px]">
                {content.title}
              </h1>
              <p className="mt-5 max-w-[720px] text-[17px] leading-8 text-[var(--fg-2)]">
                {content.description}
              </p>
              <p className="mt-4 text-[13px] font-semibold text-[var(--fg-3)]">
                Poslednje ažuriranje: {content.updatedAt}
              </p>
            </div>

            <aside className="self-start rounded-[14px] border border-[var(--border-1)] bg-[var(--surface-2)] p-5 shadow-[var(--shadow-xs)]">
              <div className="flex items-start gap-3">
                <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--secondary-color)] text-white">
                  <ShieldCheckIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="m-0 text-[15px] font-black text-[var(--fg-1)]">
                    Osnovni dokument
                  </h2>
                  <p className="mt-1 text-[13px] leading-6 text-[var(--fg-2)]">
                    Tekst je pripremljen kao praktična osnova za Marysoll
                    Booking i treba ga proveriti prema konkretnom pravnom
                    subjektu i tržištu.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="mx-auto grid max-w-[1180px] gap-8 px-5 py-10 sm:px-6 lg:grid-cols-[280px_1fr] lg:py-14">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-[14px] border border-[var(--border-1)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
              <h2 className="m-0 text-[13px] font-black uppercase tracking-[0.08em] text-[var(--fg-3)]">
                Sadržaj
              </h2>
              <ol className="mt-4 space-y-1">
                {content.sections.map((section, index) => (
                  <li key={section.title}>
                    <a
                      href={`#section-${index}`}
                      className="block rounded-[8px] px-3 py-2 text-[13px] font-semibold leading-5 text-[var(--fg-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--secondary-color)]"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </aside>

          <div className="min-w-0">
            <div className="mb-7 grid gap-3">
              {content.summary.map((paragraph) => (
                <p
                  key={paragraph}
                  className="m-0 rounded-[14px] border border-[var(--border-1)] bg-[var(--surface)] p-5 text-[15px] leading-7 text-[var(--fg-2)] shadow-[var(--shadow-xs)]"
                >
                  {paragraph}
                </p>
              ))}
            </div>

            <div className="grid gap-4">
              {content.sections.map((section, index) => (
                <article
                  id={`section-${index}`}
                  key={section.title}
                  className="scroll-mt-8 rounded-[14px] border border-[var(--border-1)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] sm:p-7"
                >
                  <div className="mb-4 flex items-start gap-3">
                    <div className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[var(--brand-100)] text-[var(--secondary-color)]">
                      {content.slug === "terms" ? (
                        <CalendarDaysIcon className="h-4 w-4" />
                      ) : (
                        <CheckCircleIcon className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="m-0 text-[12px] font-black uppercase tracking-[0.08em] text-[var(--fg-3)]">
                        {String(index + 1).padStart(2, "0")}
                      </p>
                      <h2 className="m-0 mt-1 text-[22px] font-black leading-tight text-[var(--fg-1)]">
                        {section.title}
                      </h2>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {section.body.map((paragraph) => (
                      <p
                        key={paragraph}
                        className="m-0 text-[15px] leading-7 text-[var(--fg-2)]"
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-3 rounded-[14px] border border-[var(--border-1)] bg-[#111114] p-5 text-white shadow-[var(--shadow-md)] sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="m-0 text-[18px] font-black">
                  Beauty Business Growth OS
                </h2>
                <p className="mt-1 text-[13px] leading-6 text-[#c4b6c2]">
                  Saloni upravljaju rastom na marysoll.com, a Booking pomaže
                  klijentima da nađu pravi termin brže.
                </p>
              </div>
              <Link
                href="https://marysoll.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[10px] bg-white px-4 py-2.5 text-[13px] font-black text-[#111114] transition-opacity hover:opacity-90"
              >
                marysoll.com
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

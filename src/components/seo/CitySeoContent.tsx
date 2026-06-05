// Server-rendered SEO content for the /[city] hub: available services (internal
// links), salon directory, FAQ, and JSON-LD (Breadcrumb + FAQPage + ItemList).
import Link from "next/link";
import type { CityPageData } from "@/lib/seo/indexability";
import { CATEGORY_KEYWORDS } from "@/lib/seo/categoryKeywords";
import { cityLocative } from "@/lib/seo/cityGrammar";
import { salonWord } from "@/lib/seo/serbianText";
import { buildCityFaq } from "@/lib/seo/faq";
import {
  breadcrumbJsonLd,
  faqPageJsonLd,
  salonItemListJsonLd,
} from "@/lib/seo/jsonLd";
import { SalonCard } from "./SalonCard";
import { FaqSection } from "./FaqSection";
import { JsonLdScript } from "./JsonLdScript";
import {
  blockClass,
  cardGridClass,
  chipClass,
  h2Class,
  sectionClass,
} from "./styles";

export function CitySeoContent({
  city,
  citySlug,
  data,
}: {
  city: string;
  citySlug: string;
  data: CityPageData;
}) {
  const inCity = cityLocative(city);
  const breadcrumb = breadcrumbJsonLd([
    { name: "Početna", path: "/" },
    { name: city, path: `/${citySlug}` },
  ]);

  if (data.salonCount === 0) {
    return (
      <section className={sectionClass} style={{ fontFamily: "var(--main-font)" }}>
        <JsonLdScript data={breadcrumb} />
        <h2 className={h2Class}>Još nema salona u {inCity}</h2>
        <p className="max-w-[640px] text-[15px] leading-relaxed text-[var(--fg-2)]">
          Ostavi kontakt iznad i javićemo ti čim salon u {inCity} otvori termine.
        </p>
      </section>
    );
  }

  const faqItems = buildCityFaq(city, data);

  return (
    <section className={sectionClass} style={{ fontFamily: "var(--main-font)" }}>
      <JsonLdScript data={breadcrumb} />

      <p className="max-w-[680px] text-[15px] leading-relaxed text-[var(--fg-2)]">
        <strong className="text-[var(--fg-1)]">
          {data.salonCount} {salonWord(data.salonCount)}
        </strong>{" "}
        nudi termine u {inCity}. Izaberi uslugu ili pogledaj salone.
      </p>

      {data.categories.length > 0 && (
        <div className={blockClass}>
          <h2 className={h2Class}>Usluge u {inCity}</h2>
          <div className="flex flex-wrap gap-2">
            {data.categories.map((c) => (
              <Link
                key={c.slug}
                href={`/${citySlug}/${c.urlSlug}`}
                className={chipClass}
              >
                {CATEGORY_KEYWORDS[c.slug].h1Noun}
                <span className="text-[var(--fg-3)]">{c.count}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className={blockClass}>
        <h2 className={h2Class}>Saloni u {inCity}</h2>
        <div className={cardGridClass}>
          {data.salons.slice(0, 12).map((s) => (
            <SalonCard key={s.slug} salon={s} />
          ))}
        </div>
      </div>

      <FaqSection heading={`Česta pitanja — saloni u ${inCity}`} items={faqItems} />

      <JsonLdScript data={salonItemListJsonLd(data.salons.slice(0, 12))} />
      {faqItems.length > 0 && <JsonLdScript data={faqPageJsonLd(faqItems)} />}
    </section>
  );
}

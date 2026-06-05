// Server-rendered SEO content for /[city]/[categorySlug]: intro numbers,
// recommended salons, discovery modules (related services, more salons, later
// slots), FAQ, and JSON-LD (Breadcrumb + FAQPage + ItemList). Passed into the
// client LandingPage as `seoSlot` so it all lands in the initial HTML.
import Link from "next/link";
import type { CategorySlug } from "@/lib/intent/categoryMap";
import type { CategoryPageData } from "@/lib/seo/indexability";
import { CATEGORY_KEYWORDS } from "@/lib/seo/categoryKeywords";
import { CATEGORY_TO_URL_SLUG } from "@/lib/seo/categoryUrlSlug";
import { cityLocative } from "@/lib/seo/cityGrammar";
import { salonWord } from "@/lib/seo/serbianText";
import { buildCategoryFaq } from "@/lib/seo/faq";
import {
  breadcrumbJsonLd,
  faqPageJsonLd,
  salonItemListJsonLd,
} from "@/lib/seo/jsonLd";
import { SalonCard } from "./SalonCard";
import { FaqSection } from "./FaqSection";
import { RelatedServices } from "./RelatedServices";
import { MoreSalons } from "./MoreSalons";
import { LaterSlots } from "./LaterSlots";
import { JsonLdScript } from "./JsonLdScript";
import {
  blockClass,
  cardGridClass,
  chipClass,
  h2Class,
  sectionClass,
} from "./styles";

export function CategorySeoContent({
  city,
  citySlug,
  slug,
  data,
}: {
  city: string;
  citySlug: string;
  slug: CategorySlug;
  data: CategoryPageData;
}) {
  const nounCap = CATEGORY_KEYWORDS[slug].h1Noun;
  const noun = nounCap.toLowerCase();
  const inCity = cityLocative(city);
  const path = `/${citySlug}/${CATEGORY_TO_URL_SLUG[slug]}`;

  const breadcrumb = breadcrumbJsonLd([
    { name: "Početna", path: "/" },
    { name: city, path: `/${citySlug}` },
    { name: nounCap, path },
  ]);

  if (data.salonCount === 0) {
    const others = (Object.keys(CATEGORY_TO_URL_SLUG) as CategorySlug[])
      .filter((s) => s !== slug && s !== "other")
      .slice(0, 6);
    return (
      <section className={sectionClass} style={{ fontFamily: "var(--main-font)" }}>
        <JsonLdScript data={breadcrumb} />
        <h2 className={h2Class}>
          Trenutno nema dostupnih termina za {noun} u {inCity}
        </h2>
        <p className="max-w-[640px] text-[15px] leading-relaxed text-[var(--fg-2)]">
          Ostavi kontakt iznad i javićemo ti čim se otvori termin za {noun} u{" "}
          {inCity}, ili pogledaj druge usluge i salone u gradu.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/${citySlug}`} className={chipClass}>
            Svi saloni u {inCity}
          </Link>
          {others.map((s) => (
            <Link
              key={s}
              href={`/${citySlug}/${CATEGORY_TO_URL_SLUG[s]}`}
              className={chipClass}
            >
              {CATEGORY_KEYWORDS[s].h1Noun}
            </Link>
          ))}
        </div>
      </section>
    );
  }

  const faqItems = buildCategoryFaq(city, slug, data);
  const priceText =
    data.minPrice != null
      ? `cene od ${data.minPrice.toLocaleString("sr-RS")} RSD`
      : null;

  return (
    <section className={sectionClass} style={{ fontFamily: "var(--main-font)" }}>
      <JsonLdScript data={breadcrumb} />

      <p className="max-w-[680px] text-[15px] leading-relaxed text-[var(--fg-2)]">
        <strong className="text-[var(--fg-1)]">
          {data.salonCount} {salonWord(data.salonCount)}
        </strong>{" "}
        nudi {noun} u {inCity}
        {priceText ? ` · ${priceText}` : ""}
        {data.slotCount > 0
          ? ` · ${data.slotCount} slobodnih termina danas`
          : ""}
        .
      </p>

      <div className={blockClass}>
        <h2 className={h2Class}>
          Preporučeni saloni za {noun} u {inCity}
        </h2>
        <div className={cardGridClass}>
          {data.salons.slice(0, 12).map((s) => (
            <SalonCard key={s.slug} salon={s} />
          ))}
        </div>
      </div>

      <RelatedServices
        city={city}
        citySlug={citySlug}
        categories={data.relatedCategories}
      />
      <MoreSalons city={city} salons={data.moreSalons} />
      <LaterSlots city={city} slots={data.laterSlots} />

      <FaqSection
        heading={`Česta pitanja — ${noun} u ${inCity}`}
        items={faqItems}
      />

      <JsonLdScript data={salonItemListJsonLd(data.salons.slice(0, 12))} />
      {faqItems.length > 0 && <JsonLdScript data={faqPageJsonLd(faqItems)} />}
    </section>
  );
}

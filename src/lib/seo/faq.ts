// FAQ content for SEO pages. ONE source feeds both the visible <details> FAQ and
// the FAQPage JSON-LD, so they can never disagree. Answers use real page numbers
// (salon counts, min price, slot counts) to stay unique per page.

import type { CategorySlug } from "@/lib/intent/categoryMap";
import type { CategoryPageData, CityPageData } from "@/lib/seo/indexability";
import { CATEGORY_KEYWORDS } from "@/lib/seo/categoryKeywords";
import { cityLocative } from "@/lib/seo/cityGrammar";
import { salonWord, terminWord, formatRsd } from "@/lib/seo/serbianText";

export interface FaqItem {
  question: string;
  answer: string;
}

export function buildCategoryFaq(
  city: string,
  slug: CategorySlug,
  data: CategoryPageData,
): FaqItem[] {
  const noun = CATEGORY_KEYWORDS[slug].h1Noun.toLowerCase();
  const inCity = cityLocative(city);
  const items: FaqItem[] = [];

  if (data.minPrice != null) {
    items.push({
      question: `Koliko košta ${noun} u ${inCity}?`,
      answer: `Cene za ${noun} u ${inCity} kreću od ${formatRsd(data.minPrice)} RSD, u zavisnosti od salona i izabrane usluge.`,
    });
  }

  items.push({
    question: `Koliko salona nudi ${noun} u ${inCity}?`,
    answer: `Trenutno ${data.salonCount} ${salonWord(data.salonCount)} nudi ${noun} u ${inCity} preko Marysoll-a.`,
  });

  items.push({
    question: `Mogu li da rezervišem ${noun} u ${inCity} online?`,
    answer: `Da — termin rezervišeš online preko Marysoll-a, bez poziva i čekanja, uz trenutnu potvrdu dostupnosti.`,
  });

  const topNames = data.salons.slice(0, 3).map((s) => s.name);
  if (topNames.length > 0) {
    items.push({
      question: `Koji saloni nude ${noun} u ${inCity}?`,
      answer: `Među salonima koji nude ${noun} u ${inCity} su: ${topNames.join(", ")}.`,
    });
  }

  if (data.slotCount > 0) {
    items.push({
      question: `Ima li slobodnih termina za ${noun} danas?`,
      answer: `Da, trenutno je ${data.slotCount} ${terminWord(data.slotCount)} slobodno. Dostupnost se menja u realnom vremenu.`,
    });
  }

  return items;
}

export function buildCityFaq(city: string, data: CityPageData): FaqItem[] {
  const inCity = cityLocative(city);
  const items: FaqItem[] = [];

  items.push({
    question: `Koliko salona lepote ima u ${inCity}?`,
    answer: `${data.salonCount} ${salonWord(data.salonCount)} u ${inCity} prima online rezervacije preko Marysoll-a.`,
  });

  if (data.categories.length > 0) {
    const nouns = data.categories
      .map((c) => CATEGORY_KEYWORDS[c.slug].h1Noun.toLowerCase())
      .join(", ");
    items.push({
      question: `Koje usluge mogu da rezervišem u ${inCity}?`,
      answer: `U ${inCity} su dostupne usluge: ${nouns}.`,
    });
  }

  items.push({
    question: `Kako da zakažem termin u ${inCity}?`,
    answer: `Izaberi salon ili uslugu, pa rezerviši termin online — bez poziva i čekanja, uz trenutnu potvrdu.`,
  });

  return items;
}

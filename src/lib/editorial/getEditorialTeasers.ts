import type { BlogTeaserCard, BlogTeaserSection } from "@/types/editorial";

const MAX_TEASERS_PER_SECTION = 6;

const editorialTeaserSections: BlogTeaserSection[] = [
  {
    title: "Beauty trendovi",
    subtitle: "Kratki izbor inspiracije iz salona i Marysoll vodiča.",
    items: [
      {
        id: "trend-makeup-saveti-kikikiss",
        category: "Makeup",
        title: "Ultimativni saveti za makeup koji traje celo veče",
        excerpt:
          "Kako pripremiti kožu, izabrati završnicu i rezervisati termin kada je dan već popunjen.",
        sourceLabel: "Kiki Kiss Studio",
        href: "https://kikikiss.beauty/blog/ultimativni-saveti-makeup",
        hrefType: "tenant",
      },
      {
        id: "trend-nails-prolecni-oblici",
        category: "Nails",
        title: "Nail oblici koji se najviše traže ove sezone",
        excerpt:
          "Kratak pregled stilova koje klijentkinje najčešće biraju pre rezervacije manikira.",
        sourceLabel: "Marysoll Beauty",
        href: "https://marysoll.com/blog/nail-trendovi-sezone",
        hrefType: "platform",
      },
    ],
  },
  {
    title: "Popularni tretmani",
    subtitle: "Teaseri za usluge koje korisnici najčešće traže u Booking-u.",
    items: [
      {
        id: "popular-hair-refresh",
        category: "Hair",
        title: "Brzi hair refresh pre događaja",
        excerpt:
          "Kada je dovoljno feniranje, a kada vredi rezervisati šišanje ili tretman nege.",
        sourceLabel: "Marysoll vodič",
        href: "https://marysoll.com/blog/brzi-hair-refresh-pre-dogadjaja",
        hrefType: "platform",
      },
      {
        id: "popular-massage-after-work",
        category: "Massage",
        title: "Masaža posle posla: kako izabrati termin",
        excerpt:
          "Kratke smernice za izbor trajanja tretmana i perioda dana koji najviše prija telu.",
        sourceLabel: "Marysoll Wellness",
        href: "https://marysoll.com/blog/masaza-posle-posla",
        hrefType: "platform",
      },
    ],
  },
  {
    title: "Saveti salona",
    subtitle: "Praktični saveti koji vode ka boljoj pripremi za termin.",
    items: [
      {
        id: "salon-prep-nails",
        category: "Nails",
        title: "Šta uraditi pre prvog gel manikira",
        excerpt:
          "Mali checklist pre dolaska u salon, bez kopiranja kompletnog vodiča sa salon sajta.",
        sourceLabel: "Kiki Kiss Studio",
        href: "https://kikikiss.beauty/blog/sta-uraditi-pre-gel-manikira",
        hrefType: "tenant",
      },
      {
        id: "platform-salon-growth",
        category: "Platform",
        title: "Šta salonu treba da bi slobodni termini bili vidljiviji",
        excerpt:
          "Marysoll B2B pogled na dostupnost, kategorije i jasne usluge koje pomažu otkrivanje.",
        sourceLabel: "Marysoll Platform",
        href: "https://marysoll.com/blog/sta-vam-treba-za-salon",
        hrefType: "platform",
      },
    ],
  },
];

function limitSection(section: BlogTeaserSection): BlogTeaserSection {
  return {
    ...section,
    items: section.items.slice(0, MAX_TEASERS_PER_SECTION),
  };
}

function getBlogPath(href: string): string | null {
  try {
    const url = new URL(href);
    return url.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function getEditorialTeaserSections(): BlogTeaserSection[] {
  return editorialTeaserSections.map(limitSection);
}

export function getHomepageEditorialTeaserSection(): BlogTeaserSection {
  const items = editorialTeaserSections
    .flatMap((section) => section.items)
    .slice(0, MAX_TEASERS_PER_SECTION);

  return {
    title: "Beauty trendovi",
    subtitle:
      "Malo inspiracije pre pretrage termina: trendovi, popularni tretmani i saveti salona.",
    items,
  };
}

export function findEditorialTeaserByBlogPath(
  slugPath: string,
): BlogTeaserCard | undefined {
  const normalizedSlugPath = slugPath.replace(/^\/+/, "").replace(/\/+$/, "");

  return editorialTeaserSections
    .flatMap((section) => section.items)
    .find((item) => getBlogPath(item.href) === normalizedSlugPath);
}

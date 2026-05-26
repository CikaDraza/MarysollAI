import type { BlogTeaserCard, BlogTeaserSection } from "@/types/editorial";

const MAX_HOMEPAGE_TEASERS = 3;

const editorialTeasers: BlogTeaserCard[] = [
  {
    id: "trend-makeup-saveti-kikikiss",
    audience: "client",
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
    audience: "client",
    category: "Nails",
    title: "Nail oblici koji se najviše traže ove sezone",
    excerpt:
      "Kratak pregled stilova koje klijentkinje najčešće biraju pre rezervacije manikira.",
    sourceLabel: "Marysoll",
    href: "https://marysoll.com/blog/nail-trendovi-sezone",
    hrefType: "platform",
  },
  {
    id: "popular-hair-refresh",
    audience: "client",
    category: "Hair",
    title: "Brzi hair refresh pre događaja",
    excerpt:
      "Kada je dovoljno feniranje, a kada vredi rezervisati šišanje ili tretman nege.",
    sourceLabel: "Marysoll",
    href: "https://marysoll.com/blog/brzi-hair-refresh-pre-dogadjaja",
    hrefType: "platform",
  },
  {
    id: "popular-massage-after-work",
    audience: "client",
    category: "Massage",
    title: "Masaža posle posla: kako izabrati termin",
    excerpt:
      "Kratke smernice za izbor trajanja tretmana i perioda dana koji najviše prija telu.",
    sourceLabel: "Marysoll",
    href: "https://marysoll.com/blog/masaza-posle-posla",
    hrefType: "platform",
  },
  {
    id: "salon-prep-nails",
    audience: "client",
    category: "Nails",
    title: "Šta uraditi pre prvog gel manikira",
    excerpt:
      "Mali checklist pre dolaska u salon, bez kopiranja kompletnog vodiča sa salon sajta.",
    sourceLabel: "Kiki Kiss Studio",
    href: "https://kikikiss.beauty/blog/sta-uraditi-pre-gel-manikira",
    hrefType: "tenant",
  },
  {
    id: "marysoll-vodic-prvi-tretman",
    audience: "client",
    category: "Marysoll",
    title: "Marysoll vodič za izbor prvog tretmana",
    excerpt:
      "Kako da uporedite tretmane, trajanje i dostupne termine pre nego što pošaljete zahtev za zakazivanje.",
    sourceLabel: "Marysoll",
    href: "https://marysoll.com/blog/vodic-za-prvi-tretman",
    hrefType: "platform",
  },
  {
    id: "partner-affiliate-program",
    audience: "partner",
    category: "Affiliate",
    title: "Kako salon ulazi u Marysoll affiliate mrežu",
    excerpt:
      "Pregled partner modela za salone koji žele nove kanale preporuke i merljiv dolazak klijenata.",
    sourceLabel: "Marysoll",
    href: "https://marysoll.com/blog/affiliate-program-za-salone",
    hrefType: "platform",
  },
  {
    id: "growth-os-operativa-salona",
    audience: "partner",
    category: "Growth OS",
    title: "Growth OS za salon: od rasporeda do ponovne posete",
    excerpt:
      "Kako se ponude, raspored, klijenti i kampanje spajaju u jedan operativni sistem rasta.",
    sourceLabel: "Marysoll",
    href: "https://marysoll.com/blog/sta-vam-treba-za-salon",
    hrefType: "platform",
  },
  {
    id: "partner-booking-visibility",
    audience: "partner",
    category: "Booking visibility",
    title: "Kako salon postaje vidljiviji u Booking pretrazi",
    excerpt:
      "Kratak uvod u kategorije, slobodne termine i sadržaj koji pomaže salonima da dođu do novih klijenata.",
    sourceLabel: "Marysoll",
    href: "https://marysoll.com/blog/booking-visibility-za-salone",
    hrefType: "platform",
  },
  {
    id: "ai-marketing-za-salone",
    audience: "partner",
    category: "AI marketing",
    title: "AI marketing koji radi uz realne termine salona",
    excerpt:
      "Kako sadržaj, preporuke i automatizovane poruke mogu da prate slobodne kapacitete, a ne samo kalendar objava.",
    sourceLabel: "Marysoll",
    href: "https://marysoll.com/blog/ai-marketing-za-salone",
    hrefType: "platform",
  },
  {
    id: "online-zakazivanje-salon",
    audience: "partner",
    category: "Online zakazivanje",
    title: "Online zakazivanje bez haosa u rasporedu",
    excerpt:
      "Šta salon treba da pripremi da bi klijenti mogli brzo da pronađu uslugu, termin i potvrdu.",
    sourceLabel: "Marysoll",
    href: "https://marysoll.com/blog/online-zakazivanje-za-salone",
    hrefType: "platform",
  },
];

function getBlogPath(href: string): string | null {
  try {
    const url = new URL(href);
    return url.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function getEditorialTeaserSections(): BlogTeaserSection[] {
  return [
    {
      title: "Beauty trendovi",
      subtitle: "Trendovi, popularni tretmani i saveti salona.",
      categoryLabels: ["Makeup", "Nails", "Hair", "Massage", "Marysoll"],
      items: editorialTeasers.filter((item) => item.audience === "client"),
    },
    {
      title: "Postani partner za salone",
      subtitle:
        "Marysoll vodiči za salone koji žele više vidljivosti, online zakazivanje i bolji marketing.",
      categoryLabels: [
        "Affiliate",
        "Growth OS",
        "Booking visibility",
        "AI marketing",
        "Online zakazivanje",
      ],
      items: editorialTeasers.filter((item) => item.audience === "partner"),
    },
  ];
}

export function getHomepageEditorialTeaserSection(): BlogTeaserSection {
  const items = editorialTeasers
    .filter((item) => item.audience === "client")
    .slice(0, MAX_HOMEPAGE_TEASERS);

  return {
    title: "Beauty trendovi",
    subtitle:
      "Malo inspiracije pre pretrage termina: trendovi, popularni tretmani i saveti salona.",
    showMoreHref: "/blog",
    showMoreLabel: "Pogledaj više",
    items,
  };
}

export function findEditorialTeaserByBlogPath(
  slugPath: string,
): BlogTeaserCard | undefined {
  const normalizedSlugPath = slugPath.replace(/^\/+/, "").replace(/\/+$/, "");

  return editorialTeasers.find(
    (item) => getBlogPath(item.href) === normalizedSlugPath,
  );
}

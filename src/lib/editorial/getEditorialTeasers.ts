import type {
  BlogTeaserCard,
  BlogTeaserCategory,
  BlogTeaserSection,
} from "@/types/editorial";
import type { CategorySlug } from "@/lib/intent/categoryMap";

export const MAX_HOMEPAGE_TEASERS = 6;
export const MAX_CATEGORY_TEASERS = 3;

/** Category slug → editorial teaser category label. */
const SLUG_TO_TEASER_CATEGORY: Partial<Record<CategorySlug, BlogTeaserCategory>> =
  {
    hair: "Hair",
    nails: "Nails",
    makeup: "Makeup",
    massage: "Massage",
  };

/**
 * Curated, hardcoded salon teasers. Now empty: every editorial post (platform
 * and tenant) is sourced dynamically from published campaigns in the database
 * (see getCampaignTeasers / getEditorialSections), so nothing needs to be
 * hand-maintained here. Kept as a hook in case a curated card is ever needed.
 */
const staticTenantTeasers: BlogTeaserCard[] = [];

export function getStaticTenantTeasers(): BlogTeaserCard[] {
  return staticTenantTeasers;
}

/** Dedupe by canonical href (fallback id), preserving order. */
export function dedupeTeasers(cards: BlogTeaserCard[]): BlogTeaserCard[] {
  const seen = new Set<string>();
  const out: BlogTeaserCard[] = [];
  for (const card of cards) {
    const key = (card.href || card.id).trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(card);
  }
  return out;
}

/** /blog: two audience-segmented sections built from a merged card list. */
export function buildEditorialSections(
  cards: BlogTeaserCard[],
): BlogTeaserSection[] {
  const client = cards.filter((item) => item.audience === "client");
  const partner = cards.filter((item) => item.audience === "partner");

  const sections: BlogTeaserSection[] = [];
  if (client.length > 0) {
    sections.push({
      title: "Beauty trendovi",
      subtitle: "Trendovi, popularni tretmani i saveti salona.",
      categoryLabels: ["Makeup", "Nails", "Hair", "Massage", "Marysoll"],
      items: client,
    });
  }
  if (partner.length > 0) {
    sections.push({
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
      items: partner,
    });
  }
  return sections;
}

/**
 * Homepage "Beauty trendovi": a single mixed-audience section. Real DB campaigns
 * come first (caller orders them ahead of the static posts) so freshly published
 * content surfaces on the landing page, then curated salon posts fill the grid.
 */
export function buildHomepageSection(
  cards: BlogTeaserCard[],
): BlogTeaserSection {
  return {
    title: "Beauty trendovi",
    subtitle:
      "Malo inspiracije pre pretrage termina: trendovi, popularni tretmani i saveti salona.",
    showMoreHref: "/blog",
    showMoreLabel: "Pogledaj više",
    items: cards.slice(0, MAX_HOMEPAGE_TEASERS),
  };
}

/**
 * Category-filtered teasers for a /[city]/[categorySlug] page. Leads with the
 * matching category, pads with general Marysoll posts up to MAX_CATEGORY_TEASERS.
 * Returns null when nothing relevant exists (caller falls back to the homepage
 * section).
 */
export function buildCategorySection(
  slug: CategorySlug,
  cards: BlogTeaserCard[],
): BlogTeaserSection | null {
  const label = SLUG_TO_TEASER_CATEGORY[slug];
  const clientTeasers = cards.filter((item) => item.audience === "client");

  const matched = label
    ? clientTeasers.filter((item) => item.category === label)
    : [];
  const general = clientTeasers.filter(
    (item) => item.category === "Marysoll" && !matched.includes(item),
  );
  const items = [...matched, ...general].slice(0, MAX_CATEGORY_TEASERS);
  if (items.length === 0) return null;

  return {
    title: "Beauty saveti i trendovi",
    subtitle: "Inspiracija pre rezervacije termina.",
    showMoreHref: "/blog",
    showMoreLabel: "Pogledaj više",
    items,
  };
}

/**
 * Sync, DB-free homepage section. Used as the fallback in the client
 * LandingPage when a server page does not pass the merged (DB + static) prop.
 */
export function getStaticHomepageEditorialTeaserSection(): BlogTeaserSection {
  return buildHomepageSection(getStaticTenantTeasers());
}

function getBlogPath(href: string): string | null {
  try {
    const url = new URL(href);
    return url.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function findEditorialTeaserByBlogPath(
  slugPath: string,
): BlogTeaserCard | undefined {
  const normalizedSlugPath = slugPath.replace(/^\/+/, "").replace(/\/+$/, "");

  return staticTenantTeasers.find(
    (item) => getBlogPath(item.href) === normalizedSlugPath,
  );
}

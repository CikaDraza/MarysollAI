import { cache } from "react";
import { connectToDB } from "@/lib/db/mongodb";
import { NewsletterCampaign } from "@/models/NewsletterCampaign";
import type {
  BlogTeaserAudience,
  BlogTeaserCard,
  BlogTeaserCategory,
} from "@/types/editorial";

// Canonical platform host. Booking is a read-only consumer: it only renders
// teaser cards and links the full article to the platform's own landing page,
// never re-rendering the post to avoid duplicate content. The platform owns the
// full block schema and rendering.
//
// Prefix separation (platform vs tenant):
//   - PLATFORM blogs render at  marysoll.com/newsletter/<slug>
//   - TENANT   blogs render at  <tenant-domain>/blog/<slug>   (e.g. kikikiss.beauty/blog/<slug>)
// We only surface `scope: "platform"` campaigns here, so the prefix is always
// `/newsletter/`. The platform's /newsletter/[slug] route matches `landingPage.slug`
// exactly (audience-partner + legacy), so the link always resolves. Tenant content
// is covered by the curated tenant teasers (full /blog/ URLs) in getEditorialTeasers.
const PLATFORM_BASE = "https://marysoll.com";
const PLATFORM_LANDING_PREFIX = "newsletter";

const KNOWN_CATEGORIES: readonly BlogTeaserCategory[] = [
  "Makeup",
  "Nails",
  "Hair",
  "Massage",
  "Marysoll",
  "Affiliate",
  "Growth OS",
  "Booking visibility",
  "AI marketing",
  "Online zakazivanje",
];

/**
 * Minimal shape we read off a lean campaign document. `.lean()` returns the raw
 * stored document including fields the platform writes but booking's slim schema
 * does not declare (audience, editorialCategory, seo, previewText), so we read
 * them defensively here rather than expanding the model.
 */
interface CampaignLeanDoc {
  _id: unknown;
  name?: string;
  subject?: string;
  previewText?: string;
  landingPage?: {
    slug?: string;
    audience?: string;
    editorialCategory?: string;
    layout?: Array<Record<string, unknown>>;
    seo?: { description?: string; ogImage?: string };
  };
}

function normalizeCategory(raw: string | undefined): BlogTeaserCategory {
  if (raw && (KNOWN_CATEGORIES as readonly string[]).includes(raw)) {
    return raw as BlogTeaserCategory;
  }
  return "Marysoll";
}

function normalizeAudience(raw: string | undefined): BlogTeaserAudience {
  return raw === "partner" ? "partner" : "client";
}

/**
 * Reduce a stored landing slug to a bare slug, stripping anything that would
 * collide with the platform prefix. Mirrors the platform's
 * `normalizeNewsletterLandingSlug` so booking links match the canonical route
 * whether the DB stored a bare slug, a `/blog/<slug>`, a `newsletter/<slug>`, or
 * a full URL. The platform's /newsletter/[slug] route matches the bare slug.
 */
function normalizeLandingSlug(slug: string | undefined): string | null {
  if (!slug) return null;
  const cleaned = slug
    .trim()
    .replace(/^https?:\/\/[^/]+/i, "") // drop protocol + host if a full URL was stored
    .replace(/^\/+/, "") // drop leading slashes
    .replace(/^(?:blog|newsletter)\/+/i, "") // drop a leading blog/ or newsletter/ prefix
    .replace(/\/+$/, ""); // drop trailing slashes
  return cleaned || null;
}

/** First hero-like block (the platform leads layouts with a hero), else block 0. */
function firstHeroBlock(
  layout: Array<Record<string, unknown>> | undefined,
): Record<string, unknown> | undefined {
  if (!Array.isArray(layout) || layout.length === 0) return undefined;
  return (
    layout.find(
      (block) =>
        typeof block?.type === "string" && /hero/i.test(block.type as string),
    ) ?? layout[0]
  );
}

export function mapCampaignToTeaser(
  doc: CampaignLeanDoc,
): BlogTeaserCard | null {
  const slug = normalizeLandingSlug(doc.landingPage?.slug);
  if (!slug) return null;

  const hero = firstHeroBlock(doc.landingPage?.layout);
  const heroTitle = typeof hero?.title === "string" ? hero.title : undefined;
  const heroSubtitle =
    typeof hero?.subtitle === "string" ? hero.subtitle : undefined;
  const heroImage = Array.isArray(hero?.images)
    ? (hero.images[0] as { src?: string; alt?: string } | undefined)
    : undefined;

  const title = heroTitle ?? doc.name ?? "Marysoll vodič";
  const excerpt =
    doc.landingPage?.seo?.description ??
    heroSubtitle ??
    doc.previewText ??
    doc.subject ??
    "";

  return {
    id: String(doc._id),
    audience: normalizeAudience(doc.landingPage?.audience),
    category: normalizeCategory(doc.landingPage?.editorialCategory),
    title,
    excerpt,
    imageUrl: heroImage?.src ?? doc.landingPage?.seo?.ogImage,
    imageAlt: heroImage?.alt ?? title,
    sourceLabel: "Marysoll",
    href: `${PLATFORM_BASE}/${PLATFORM_LANDING_PREFIX}/${slug}`,
    hrefType: "platform",
  };
}

/**
 * Published platform landing pages, mapped to editorial teaser cards. Newest
 * first. Read-only: mirrors the same filter the campaigns API uses.
 */
export const getPublishedCampaignTeasers = cache(
  async (): Promise<BlogTeaserCard[]> => {
    try {
      await connectToDB();
      const campaigns = (await NewsletterCampaign.find({
        scope: "platform",
        campaignType: "email-landing",
        "landingPage.enabled": true,
        "landingPage.status": "published",
      })
        .sort({ updatedAt: -1 })
        .lean()) as unknown as CampaignLeanDoc[];

      return campaigns
        .map(mapCampaignToTeaser)
        .filter((card): card is BlogTeaserCard => card !== null);
    } catch (error) {
      console.error("[getPublishedCampaignTeasers] failed", error);
      return [];
    }
  },
);

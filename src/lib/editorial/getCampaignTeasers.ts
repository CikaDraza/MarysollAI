import mongoose from "mongoose";
import { cache } from "react";
import { connectToDB } from "@/lib/db/mongodb";
import { NewsletterCampaign } from "@/models/NewsletterCampaign";
import type { BlogTeaserAudience, BlogTeaserCard } from "@/types/editorial";

// Booking is a read-only consumer: it renders teaser cards only and links each
// full article to wherever it is actually hosted, never re-rendering the post
// (avoids duplicate content; the platform/tenant sites own the block rendering).
//
// Prefix separation (the rule that decides /newsletter vs /blog):
//   - PLATFORM campaigns → marysoll.com/newsletter/<slug>
//   - TENANT   campaigns → <tenant-domain>/blog/<slug>   (e.g. kikikiss.beauty/blog/<slug>)
// The platform's custom-domain proxy rewrites <tenant-domain>/blog/* to its
// internal /tenant/blogs/* route, so the tenant link resolves on the salon site.
const PLATFORM_BASE = "https://marysoll.com";
const PLATFORM_LANDING_PREFIX = "newsletter";
const TENANT_BLOG_PREFIX = "blog";
// Subdomain base for tenants without a verified custom domain (<slug>.marysoll.com).
const BASE_DOMAIN = "marysoll.com";

interface TenantInfo {
  slug?: string;
  customDomain?: string;
  customDomainVerified?: boolean;
  name?: string;
}

/**
 * Minimal shape we read off a lean campaign doc. `.lean()` returns the raw stored
 * document including fields the platform writes but booking's slim schema does
 * not declare (scope, audience, editorialCategory, seo, previewText), so we read
 * them defensively here rather than expanding the model.
 */
interface CampaignLeanDoc {
  _id: unknown;
  name?: string;
  subject?: string;
  previewText?: string;
  scope?: string;
  tenantId?: unknown;
  landingPage?: {
    slug?: string;
    audience?: string;
    editorialCategory?: string;
    layout?: Array<Record<string, unknown>>;
    seo?: { description?: string; ogImage?: string };
  };
}

function normalizeAudience(raw: string | undefined): BlogTeaserAudience {
  return raw === "partner" ? "partner" : "client";
}

/**
 * Reduce a stored landing slug to a bare slug, stripping anything that would
 * collide with the prefix (host, leading slashes, a `blog/` or `newsletter/`
 * segment, full URL). The render routes match the bare slug.
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

/** Public base URL of a tenant site: verified custom domain, else <slug>.marysoll.com. */
function tenantBaseUrl(tenant: TenantInfo | undefined): string | null {
  if (!tenant) return null;
  if (tenant.customDomain && tenant.customDomainVerified) {
    return `https://${tenant.customDomain}`;
  }
  if (tenant.slug) {
    return `https://${tenant.slug}.${BASE_DOMAIN}`;
  }
  return null;
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

function mapCampaignToTeaser(
  doc: CampaignLeanDoc,
  tenants: Map<string, TenantInfo>,
): BlogTeaserCard | null {
  const slug = normalizeLandingSlug(doc.landingPage?.slug);
  if (!slug) return null;

  // Resolve the destination URL by scope. Skip tenant posts whose salon domain
  // can't be resolved rather than emit a dead link.
  let href: string;
  let sourceLabel: string;
  let hrefType: BlogTeaserCard["hrefType"];
  if (doc.scope === "platform") {
    href = `${PLATFORM_BASE}/${PLATFORM_LANDING_PREFIX}/${slug}`;
    sourceLabel = "Marysoll";
    hrefType = "platform";
  } else {
    const tenant = doc.tenantId
      ? tenants.get(String(doc.tenantId))
      : undefined;
    const base = tenantBaseUrl(tenant);
    if (!base) return null;
    href = `${base}/${TENANT_BLOG_PREFIX}/${slug}`;
    sourceLabel = tenant?.name?.trim() || "Salon";
    hrefType = "tenant";
  }

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
    category: doc.landingPage?.editorialCategory?.trim() || "Marysoll",
    title,
    excerpt,
    imageUrl: heroImage?.src ?? doc.landingPage?.seo?.ogImage,
    imageAlt: heroImage?.alt ?? title,
    sourceLabel,
    href,
    hrefType,
  };
}

/** Batch-resolve salon domains for tenant campaigns (read-only on `tenants`). */
async function loadTenants(ids: string[]): Promise<Map<string, TenantInfo>> {
  const map = new Map<string, TenantInfo>();
  if (ids.length === 0) return map;
  try {
    const db = mongoose.connection.db;
    if (!db) return map;
    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
    const docs = await db
      .collection("tenants")
      .find(
        { _id: { $in: objectIds } },
        {
          projection: {
            slug: 1,
            customDomain: 1,
            customDomainVerified: 1,
            name: 1,
          },
        },
      )
      .toArray();
    for (const doc of docs) {
      map.set(String(doc._id), {
        slug: doc.slug,
        customDomain: doc.customDomain,
        customDomainVerified: doc.customDomainVerified,
        name: doc.name,
      });
    }
  } catch (error) {
    console.error("[loadTenants] failed", error);
  }
  return map;
}

/**
 * Every published landing page (platform + tenant), mapped to editorial teaser
 * cards, newest first. Platform posts link to marysoll.com/newsletter/<slug>,
 * tenant posts to <salon-domain>/blog/<slug>.
 */
export const getPublishedCampaignTeasers = cache(
  async (): Promise<BlogTeaserCard[]> => {
    try {
      await connectToDB();
      const campaigns = (await NewsletterCampaign.find({
        campaignType: "email-landing",
        "landingPage.enabled": true,
        "landingPage.status": "published",
      })
        .sort({ updatedAt: -1 })
        .lean()) as unknown as CampaignLeanDoc[];

      const tenantIds = Array.from(
        new Set(
          campaigns
            .filter((c) => c.scope !== "platform" && c.tenantId)
            .map((c) => String(c.tenantId)),
        ),
      );
      const tenants = await loadTenants(tenantIds);

      return campaigns
        .map((campaign) => mapCampaignToTeaser(campaign, tenants))
        .filter((card): card is BlogTeaserCard => card !== null);
    } catch (error) {
      console.error("[getPublishedCampaignTeasers] failed", error);
      return [];
    }
  },
);

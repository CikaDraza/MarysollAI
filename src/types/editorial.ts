export type BlogTeaserCategory =
  | "Makeup"
  | "Nails"
  | "Hair"
  | "Massage"
  | "Marysoll"
  | "Affiliate"
  | "Growth OS"
  | "Booking visibility"
  | "AI marketing"
  | "Online zakazivanje";

export type BlogTeaserHrefType = "tenant" | "platform";
export type BlogTeaserAudience = "client" | "partner";

export interface BlogTeaserCard {
  id: string;
  audience: BlogTeaserAudience;
  /**
   * A known `BlogTeaserCategory` label, or any free-form `editorialCategory`
   * the platform writes (e.g. "Beauty", "Growth"). The card falls back to a
   * neutral badge style for labels outside the known set.
   */
  category: BlogTeaserCategory | (string & {});
  title: string;
  excerpt: string;
  imageUrl?: string;
  imageAlt?: string;
  sourceLabel: string;
  href: string;
  hrefType: BlogTeaserHrefType;
}

export interface BlogTeaserSection {
  title: string;
  subtitle?: string;
  categoryLabels?: BlogTeaserCategory[];
  showMoreHref?: string;
  showMoreLabel?: string;
  items: BlogTeaserCard[];
}

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
  category: BlogTeaserCategory;
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

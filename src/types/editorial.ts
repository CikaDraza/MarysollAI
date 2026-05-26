export type BlogTeaserCategory =
  | "Makeup"
  | "Nails"
  | "Hair"
  | "Massage"
  | "Beauty"
  | "Platform";

export type BlogTeaserHrefType = "tenant" | "platform";

export interface BlogTeaserCard {
  id: string;
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
  items: BlogTeaserCard[];
}

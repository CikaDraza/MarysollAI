export type LandingBlockType =
  | "HeroPrimaryBlock"
  | "HeroVisualBlock"
  | "ArticleSectionBlock"
  | "ContentSplitBlock"
  | "CTABlock"
  | "FeatureGridBlock";

export interface BaseLandingBlock {
  id: string;
  type: LandingBlockType;
  priority: number;
  align?: "left" | "center" | "right";
  size?: "xs" | "sm" | "md" | "lg";
}

/* ---------- HERO ---------- */
export interface HeroPrimaryBlock extends BaseLandingBlock {
  type: "HeroPrimaryBlock";
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  href?: string;
}

/* ---------- HERO Visual ---------- */
export interface HeroVisualBlock extends BaseLandingBlock {
  type: "HeroVisualBlock";
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  href?: string;
  imagesUrl?: string[];
}

/* ---------- ARTICLE ---------- */
export interface ArticleSectionBlock extends BaseLandingBlock {
  type: "ArticleSectionBlock";
  content: string;
}

/* ---------- FEATURES ---------- */
export interface FeatureItem {
  title: string;
  description: string;
}

export interface FeatureGridBlock extends BaseLandingBlock {
  type: "FeatureGridBlock";
  features: FeatureItem[];
  columns?: number;
}

/* ---------- Content Split ---------- */

export interface ContentSplitBlock extends BaseLandingBlock {
  type: "ContentSplitBlock";
  heading: string;
  content: string;
}

/* ---------- PRICING ---------- */

export interface Plan {
  id: string;
  name: string;
  description?: string;
  items?: string[];
  price: {
    amount: number;
    currency: "RSD" | "EUR";
  };
  discount?: {
    type: "percentage" | "fixed";
    value: number;
    validFrom?: string; // ISO
    validTo?: string; // ISO
    untilChanged?: boolean;
  };
  highlight?: "none" | "popular" | "bestValue";
  availability?: "available" | "unavailable" | "limited";
  ctaLabel?: string;
  order?: number;
  href: string;
}

/* ---------- CTABlock ---------- */

export interface CTABlock extends BaseLandingBlock {
  type: "CTABlock";
  ctaLabel: string;
  href: string;
  variant?: "primary" | "secondary";
}

/* ---------- UNION ---------- */
export type LandingBlock =
  | HeroPrimaryBlock
  | HeroVisualBlock
  | ArticleSectionBlock
  | ContentSplitBlock
  | CTABlock
  | FeatureGridBlock;

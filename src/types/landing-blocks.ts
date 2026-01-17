export type LandingBlockType =
  | "HeroPrimaryBlock"
  | "ArticleSectionBlock"
  | "FeatureGridBlock";

export interface BaseLandingBlock {
  id: string;
  type: LandingBlockType;
  priority: number;
}

/* ---------- HERO ---------- */
export interface HeroPrimaryBlock extends BaseLandingBlock {
  type: "HeroPrimaryBlock";
  title: string;
  subtitle?: string;
  align?: "left" | "center" | "right";
  size?: "sm" | "md" | "lg";
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

/* ---------- UNION ---------- */
export type LandingBlock =
  | HeroPrimaryBlock
  | ArticleSectionBlock
  | FeatureGridBlock;

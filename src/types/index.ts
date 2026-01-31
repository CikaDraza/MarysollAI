// ai-landing/src/types/index.ts
import { LandingBlock } from "./landing-blocks";

export type BlockType =
  | "hero"
  | "text"
  | "image"
  | "cta"
  | "pricing"
  | "testimonials";

export interface BlockBase<T extends BlockType, P> {
  id: string;
  type: T;
  props: P;
}

export interface HeroBlockProps {
  title: string;
  subtitle: string;
  imageUrl?: string;
}

export interface TextBlockProps {
  content: string;
}

export interface ImageBlockProps {
  images: {
    imageUrl: string;
    alt: string;
  }[];
}

export type CampaignBlock =
  | BlockBase<"hero", HeroBlockProps>
  | BlockBase<"text", TextBlockProps>
  | BlockBase<"image", ImageBlockProps>;

export interface Campaign {
  _id: string;
  slug: string;
  title: string;
  blocks: CampaignBlock[];
  landingPage?: LandingPageConfig;
  createdAt: string;
}

export interface INewsletterCampaign {
  _id: string;
  name: string;
  subject: string;
  campaignType: "email-only" | "email-landing";
  landingPage?: LandingPageConfig;
  updatedAt: string;
}

export type CampaignSemanticType =
  | "promotion"
  | "news"
  | "tips"
  | "events"
  | "birthday"
  | "education";

export interface LandingPageConfig {
  layout: LandingBlock[];
  semanticType?: string;
  enabled: boolean;
  slug: string;
  generatedAt?: string;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

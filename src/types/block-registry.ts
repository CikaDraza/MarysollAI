// ai-landing/src/types/block-registry.ts
import {
  HeroPrimaryBlock,
  ArticleSectionBlock,
  FeatureGridBlock,
  ContentSplitBlock,
  HeroVisualBlock,
  CTABlock,
} from "@/types/landing-blocks";

export interface BlockTypeMap {
  HeroPrimaryBlock: HeroPrimaryBlock;
  HeroVisualBlock: HeroVisualBlock;
  ArticleSectionBlock: ArticleSectionBlock;
  FeatureGridBlock: FeatureGridBlock;
  ContentSplitBlock: ContentSplitBlock;
  CTABlock: CTABlock;
}

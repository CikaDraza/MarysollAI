import { BlockTypeMap } from "@/types/block-registry";
import ArticleSectionBlockView from "../blocks/ArticleSectionBlockView";
import FeatureGridBlockView from "../blocks/FeatureGridBlockView";
import HeroPrimaryBlockView from "../blocks/HeroPrimaryBlockView";
import HeroVisualBlockView from "../blocks/HeroVisualBlockView";
import { ContentSplitBlockView } from "../blocks/ContentSplitBlockView";
import { CTABlockView } from "../blocks/CTABlockView";

type BlockComponentMap = {
  [K in keyof BlockTypeMap]: React.ComponentType<{
    block: BlockTypeMap[K];
  }>;
};

export const blockRegistry = {
  HeroPrimaryBlock: HeroPrimaryBlockView,
  HeroVisualBlock: HeroVisualBlockView,
  ArticleSectionBlock: ArticleSectionBlockView,
  FeatureGridBlock: FeatureGridBlockView,
  ContentSplitBlock: ContentSplitBlockView,
  CTABlock: CTABlockView,
} satisfies BlockComponentMap;

import { BlockTypeMap } from "@/types/block-registry";
import ArticleSectionBlockView from "../blocks/ArticleSectionBlockView";
import FeatureGridBlockView from "../blocks/FeatureGridBlockView";
import HeroPrimaryBlockView from "../blocks/HeroPrimaryBlockView";

type BlockComponentMap = {
  [K in keyof BlockTypeMap]: React.ComponentType<{
    block: BlockTypeMap[K];
  }>;
};

export const blockRegistry = {
  HeroPrimaryBlock: HeroPrimaryBlockView,
  ArticleSectionBlock: ArticleSectionBlockView,
  FeatureGridBlock: FeatureGridBlockView,
} satisfies BlockComponentMap;

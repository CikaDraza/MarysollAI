import { LandingBlock } from "@/types/landing-blocks";
import HeroPrimaryBlockView from "../blocks/HeroPrimaryBlockView";
import ArticleSectionBlockView from "../blocks/ArticleSectionBlockView";
import FeatureGridBlockView from "../blocks/FeatureGridBlockView";
import HeroVisualBlockView from "../blocks/HeroVisualBlockView";
import { ContentSplitBlockView } from "../blocks/ContentSplitBlockView";
import { CTABlockView } from "../blocks/CTABlockView";

interface Props {
  blocks: LandingBlock[];
}

export function CampaignLayoutEngine({ blocks }: Props) {
  const visibleBlocks = Array.isArray(blocks)
    ? [...blocks].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
    : [];

  return (
    <main className="relative overflow-x-visible flex flex-col min-h-screen w-full px-1 2xl:px-16 pb-36">
      {visibleBlocks.map((block) => {
        switch (block.type) {
          case "HeroPrimaryBlock":
            return <HeroPrimaryBlockView key={block.id} block={block} />;

          case "HeroVisualBlock":
            return <HeroVisualBlockView key={block.id} block={block} />;

          case "ArticleSectionBlock":
            return <ArticleSectionBlockView key={block.id} block={block} />;

          case "FeatureGridBlock":
            return <FeatureGridBlockView key={block.id} block={block} />;

          case "ContentSplitBlock":
            return <ContentSplitBlockView key={block.id} block={block} />;

          case "CTABlock":
            return <CTABlockView key={block.id} block={block} />;

          default:
            return null;
        }
      })}
    </main>
  );
}

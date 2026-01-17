import { LandingBlock } from "@/types/landing-blocks";
import HeroPrimaryBlockView from "../blocks/HeroPrimaryBlockView";
import ArticleSectionBlockView from "../blocks/ArticleSectionBlockView";
import FeatureGridBlockView from "../blocks/FeatureGridBlockView";

interface Props {
  blocks: LandingBlock[];
}

export function CampaignLayoutEngine({ blocks }: Props) {
  const visibleBlocks = blocks.sort((a, b) => a.priority - b.priority);

  return (
    <main className="relative overflow-x-visible flex flex-col min-h-screen w-full px-1 2xl:px-16 pb-36">
      {visibleBlocks.map((block) => {
        switch (block.type) {
          case "HeroPrimaryBlock":
            return <HeroPrimaryBlockView key={block.id} block={block} />;

          case "ArticleSectionBlock":
            return <ArticleSectionBlockView key={block.id} block={block} />;

          case "FeatureGridBlock":
            return <FeatureGridBlockView key={block.id} block={block} />;

          default:
            return null;
        }
      })}
    </main>
  );
}

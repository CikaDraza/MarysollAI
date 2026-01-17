import { ArticleSectionBlock } from "@/types/landing-blocks";
import { Reveal } from "../motion/Reveal";

export default function ArticleSectionBlockView({
  block,
}: {
  block: ArticleSectionBlock;
}) {
  return (
    <Reveal>
      <p className="mt-5 line-clamp-3 text-sm/6 text-gray-600">
        {block.content}
      </p>
    </Reveal>
  );
}

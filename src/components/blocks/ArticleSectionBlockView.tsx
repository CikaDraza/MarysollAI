import { ArticleSectionBlock } from "@/types/landing-blocks";
import { Reveal } from "../motion/Reveal";

export default function ArticleSectionBlockView({
  block,
}: {
  block: ArticleSectionBlock;
}) {
  return (
    <Reveal>
      <h2 className="text-4xl font-bold tracking-tight sm:text-6xl">
        {block.title}
      </h2>
      <p className="mt-5 line-clamp-3 text-lg text-gray-600">{block.content}</p>
    </Reveal>
  );
}

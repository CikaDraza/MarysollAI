import { FeatureGridBlock } from "@/types/landing-blocks";
import { Reveal } from "../motion/Reveal";

export default function FeatureGridBlockView({
  block,
}: {
  block: FeatureGridBlock;
}) {
  return (
    <Reveal>
      <div className="mx-auto mt-10 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-16 border-t border-gray-200 pt-10 sm:mt-16 sm:pt-16 lg:mx-0 lg:max-w-none lg:grid-cols-3">
        {block.features.map((f, i) => (
          <article
            key={i}
            className="flex max-w-xl flex-col items-start justify-between"
          >
            <div className="group relative grow">
              <h3 className="mt-3 text-lg/6 font-semibold text-gray-900 group-hover:text-gray-600">
                {f.title}
              </h3>
              <p className="mt-5 line-clamp-3 text-sm/6 text-gray-600">
                {f.description}
              </p>
            </div>
          </article>
        ))}
      </div>
    </Reveal>
  );
}

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
            className="relative flex max-w-xl overflow-hidden p-3 shadow-sm rounded-md flex-col items-start justify-between"
          >
            <div
              aria-hidden="true"
              className="absolute top-1/2 left-[max(-7rem,calc(50%-52rem))] -z-10 -translate-y-1/2 transform-gpu blur-2xl"
            >
              <div
                style={{
                  clipPath:
                    "polygon(74.8% 41.9%, 97.2% 73.2%, 100% 34.9%, 92.5% 0.4%, 87.5% 0%, 75% 28.6%, 58.5% 54.6%, 50.1% 56.8%, 46.9% 44%, 48.3% 17.4%, 24.7% 53.9%, 0% 27.9%, 11.9% 74.2%, 24.9% 54.1%, 68.6% 100%, 74.8% 41.9%)",
                }}
                className="aspect-577/310 w-144.25 bg-linear-to-r from-[#ff80b5] to-[#9089fc] opacity-30"
              />
            </div>
            <div
              aria-hidden="true"
              className="absolute top-1/2 left-[max(45rem,calc(50%+8rem))] -z-10 -translate-y-1/2 transform-gpu blur-2xl"
            >
              <div
                style={{
                  clipPath:
                    "polygon(74.8% 41.9%, 97.2% 73.2%, 100% 34.9%, 92.5% 0.4%, 87.5% 0%, 75% 28.6%, 58.5% 54.6%, 50.1% 56.8%, 46.9% 44%, 48.3% 17.4%, 24.7% 53.9%, 0% 27.9%, 11.9% 74.2%, 24.9% 54.1%, 68.6% 100%, 74.8% 41.9%)",
                }}
                className="aspect-577/310 w-144.25 bg-linear-to-r from-[#ff80b5] to-[#9089fc] opacity-30"
              />
            </div>
            <div className="group relative grow">
              <h3 className="mt-3 text-lg/6 font-semibold text-gray-800 group-hover:text-gray-600">
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

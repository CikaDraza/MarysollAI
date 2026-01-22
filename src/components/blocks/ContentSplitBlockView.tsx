"use client";

import { ContentSplitBlock } from "@/types/landing-blocks";
import clsx from "clsx";

export function ContentSplitBlockView({ block }: { block: ContentSplitBlock }) {
  return (
    <section className="py-14">
      <div
        className={clsx(
          "mx-auto max-w-5xl grid gap-8 px-6",
          block.align === "left"
            ? "md:grid-cols-[1fr_2fr]"
            : "md:grid-cols-[2fr_1fr]",
        )}
      >
        <h3 className="text-2xl font-semibold">{block.heading}</h3>
        <p className="leading-relaxed text-muted-foreground">{block.content}</p>
      </div>
    </section>
  );
}

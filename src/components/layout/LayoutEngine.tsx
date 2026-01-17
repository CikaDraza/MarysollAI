// src/components/layout/LayoutEngine.tsx
"use client";

import { BaseBlock } from "@/types/landing-block";
import { blockFactory } from "./blockFactory";
import { BlockTypes } from "@/types/block-types";

interface Props {
  blocks: BaseBlock[];
  renderBeforeBlock?: (type: BlockTypes) => React.ReactNode;
}

export function LayoutEngine({ blocks, renderBeforeBlock }: Props) {
  if (!blocks) {
    return null;
  }
  return (
    <>
      {blocks
        .slice()
        .sort((a, b) => a.priority - b.priority)
        .map((block, i) => (
          <div key={i}>
            {renderBeforeBlock?.(block.type)}
            {blockFactory(block)}
          </div>
        ))}
    </>
  );
}

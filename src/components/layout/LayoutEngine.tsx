// src/components/layout/LayoutEngine.tsx
"use client";

import { BaseBlock, BlockTypes } from "@/types/landing-block";
import { blockFactory } from "./blockFactory";

interface Props {
  blocks: BaseBlock[] | null;
  renderBeforeBlock?: (type: BlockTypes) => React.ReactNode;
  onMessageAction?: (type: string) => void;
}

export function LayoutEngine({
  blocks,
  renderBeforeBlock,
  onMessageAction,
}: Props) {
  if (!blocks || blocks.length === 0) {
    return null;
  }
  return (
    <>
      {[...blocks]
        .sort((a, b) => a.priority - b.priority)
        .map((block, i) => (
          <div key={i}>
            {renderBeforeBlock?.(block.type)}
            {blockFactory(block, onMessageAction)}
          </div>
        ))}
    </>
  );
}

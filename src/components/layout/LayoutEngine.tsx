// src/components/layout/LayoutEngine.tsx
"use client";

import { BaseBlock, BlockTypes } from "@/types/landing-block";
import { blockFactory } from "./blockFactory";

interface Props {
  blocks: BaseBlock[] | BaseBlock | null;
  renderBeforeBlock?: (type: BlockTypes) => React.ReactNode;
  onMessageAction?: (type: string) => void;
}

export function LayoutEngine({
  blocks,
  renderBeforeBlock,
  onMessageAction,
}: Props) {
  if (!blocks) return null;
  const blocksArray = Array.isArray(blocks) ? blocks : [blocks];
  console.log({ block_array: blocksArray });

  if (blocksArray.length === 0) return null;
  return (
    <>
      {blocksArray
        .sort((a, b) => (a.priority || 0) - (b.priority || 0))
        .map((block) => (
          <div key={block.id || block.type} className="block-wrapper">
            {/* Ovde ubacujemo tekst koji ide PRE bloka */}
            {renderBeforeBlock && renderBeforeBlock(block.type)}

            {/* Renderujemo sam blok preko factory-ja */}
            <div className="relative">
              {blockFactory(block, onMessageAction)}
            </div>
          </div>
        ))}
    </>
  );
}

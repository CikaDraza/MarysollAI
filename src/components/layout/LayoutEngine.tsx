// src/components/layout/LayoutEngine.tsx
//
// Phase 1.5 — Render-time block dedupe.
//
// Previously: a lazy `useState(() => filter)` decided which blocks to render
// once at mount. If parent re-rendered with new block props matching a type
// already mounted elsewhere, this engine had no way to recognize it and
// could re-mount. Now every render consults blockOrchestrator and:
//   - If THIS engine instance owns the block → render
//   - If ANOTHER engine owns it → focus and skip
//   - If unowned → claim + render
"use client";

import { useEffect, useMemo, useRef } from "react";
import { SparklesIcon } from "@heroicons/react/24/outline";
import { BaseBlock, BlockTypes } from "@/types/landing-block";
import { blockFactory } from "./blockFactory";
import { blockOrchestrator } from "@/lib/ai/block-orchestrator";
import { aiLog } from "@/lib/ai/debug-log";

const log = aiLog("LAYOUT_ENGINE");

const AI_FOLLOWUPS: Partial<Record<BlockTypes, string>> = {
  AppointmentCalendarBlock: "Preporuči mi slobodan termin za ovu nedelju",
  AuthBlock: "Imam problem sa prijavom, treba mi pomoć",
  ServicePriceBlock: "Koji tretman preporučuješ za opuštanje?",
  TestimonialBlock: "Prikaži mi najnovije utiske klijenata",
  CalendarBlock: "Koji termini su slobodni ove sedmice?",
};

interface Props {
  blocks: BaseBlock[] | BaseBlock | null;
  renderBeforeBlock?: (type: BlockTypes) => React.ReactNode;
  onMessageAction?: (type: string) => void;
  onBlockAction?: (type: string) => void;
  isLanding?: boolean;
}

export function LayoutEngine({
  blocks,
  renderBeforeBlock,
  onMessageAction,
  onBlockAction,
  isLanding,
}: Props) {
  const blocksArray = blocks ? (Array.isArray(blocks) ? blocks : [blocks]) : [];

  // Tracks the block types this LayoutEngine instance has claimed.
  // We keep this in a ref so that the dedupe filter computed on every render
  // can distinguish "ours" from "someone else's already-mounted block".
  const ownedRef = useRef<Set<string>>(new Set());

  // Render-time dedupe.
  // Recomputed every render so when parent passes a new blocks array, blocks
  // already open elsewhere are focused (and skipped) rather than re-mounted.
  const toRender = useMemo<BaseBlock[]>(() => {
    const result: BaseBlock[] = [];
    const seenInThisPass = new Set<string>();

    for (const b of blocksArray) {
      // Dedupe within this render pass first (e.g. AI returned LoginBlock twice)
      if (seenInThisPass.has(b.type)) continue;
      seenInThisPass.add(b.type);

      if (ownedRef.current.has(b.type)) {
        // We already mounted it earlier — keep rendering it.
        result.push(b);
        continue;
      }

      if (blockOrchestrator.isBlockOpen(b.type)) {
        // Mounted by another LayoutEngine instance. Focus + skip render.
        log("dedupe.focus_existing", { type: b.type });
        blockOrchestrator.focusBlock(b.type);
        continue;
      }

      result.push(b);
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(blocksArray.map((b) => `${b.type}:${b.id ?? ""}`))]);

  // Claim ownership on mount, release on unmount.
  useEffect(() => {
    if (toRender.length === 0) return;
    const claimed: string[] = [];
    for (const b of toRender) {
      if (!ownedRef.current.has(b.type)) {
        blockOrchestrator.openBlock(b.type);
        ownedRef.current.add(b.type);
        claimed.push(b.type);
        log("mount", { type: b.type });
      }
    }
    return () => {
      claimed.forEach((t) => {
        blockOrchestrator.closeBlock(t);
        ownedRef.current.delete(t);
        log("unmount", { type: t });
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toRender]);

  if (toRender.length === 0) return null;

  return (
    <>
      {toRender
        .sort((a, b) => (a.priority || 0) - (b.priority || 0))
        .map((block) => {
          const followUp = AI_FOLLOWUPS[block.type];
          return (
            <div
              key={block.id || block.type}
              data-block-type={block.type}
              className="animate-in zoom-in-95 duration-700"
            >
              {renderBeforeBlock && renderBeforeBlock(block.type)}

              <div className="relative">
                {blockFactory(block, onBlockAction ?? onMessageAction, isLanding)}

                {onMessageAction && followUp && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      marginTop: 10,
                      paddingRight: 4,
                    }}
                  >
                    <button
                      onClick={() => {
                        // Task 10: AI follow-up chip dedupe — if the chip would
                        // re-open a block already on screen, focus instead.
                        if (blockOrchestrator.isBlockOpen(block.type)) {
                          log("followup_chip.focus", { type: block.type });
                          blockOrchestrator.focusBlock(block.type);
                          return;
                        }
                        onMessageAction(followUp);
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        background: "transparent",
                        border: "1px solid var(--brand-100, #e9d5f9)",
                        borderRadius: 999,
                        padding: "5px 12px",
                        fontFamily: "var(--main-font)",
                        fontWeight: 600,
                        fontSize: 11,
                        color: "var(--secondary-color)",
                        cursor: "pointer",
                        transition: "background 150ms, color 150ms",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background =
                          "var(--brand-100, #e9d5f9)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background =
                          "transparent";
                      }}
                    >
                      <SparklesIcon style={{ width: 12, height: 12 }} strokeWidth={1.5} />
                      Pitaj AI
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
    </>
  );
}

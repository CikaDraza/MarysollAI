// src/components/layout/LayoutEngine.tsx
"use client";

import { SparklesIcon } from "@heroicons/react/24/outline";
import { BaseBlock, BlockTypes } from "@/types/landing-block";
import { blockFactory } from "./blockFactory";

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
}

export function LayoutEngine({
  blocks,
  renderBeforeBlock,
  onMessageAction,
}: Props) {
  if (!blocks) return null;
  const blocksArray = Array.isArray(blocks) ? blocks : [blocks];

  if (blocksArray.length === 0) return null;
  return (
    <>
      {blocksArray
        .sort((a, b) => (a.priority || 0) - (b.priority || 0))
        .map((block) => {
          const followUp = AI_FOLLOWUPS[block.type];
          return (
            <div
              key={block.id || block.type}
              className="animate-in zoom-in-95 duration-700"
            >
              {renderBeforeBlock && renderBeforeBlock(block.type)}

              <div className="relative">
                {blockFactory(block, onMessageAction)}

                {/* AI follow-up chip — only when AI is wired and hint exists */}
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
                      onClick={() => onMessageAction(followUp)}
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

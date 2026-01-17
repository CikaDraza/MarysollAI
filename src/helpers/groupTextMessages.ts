// src/helpers/groupTextMessages.ts
import { TextMessage } from "@/types/ai/ai.text-engine";
import { BlockTypes } from "@/types/block-types";

export function groupMessagesByBlock(
  messages: TextMessage[]
): Record<BlockTypes | "global", TextMessage[]> {
  return messages.reduce((acc, msg) => {
    const key = msg.attachToBlockType ?? "global";
    acc[key] ??= [];
    acc[key].push(msg);
    return acc;
  }, {} as Record<BlockTypes | "global", TextMessage[]>);
}

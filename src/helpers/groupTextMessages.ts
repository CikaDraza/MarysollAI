// src/helpers/groupTextMessages.ts
import { TextMessage } from "@/types/ai/ai.text-engine";

export function groupMessagesByBlock(
  messages: TextMessage[],
): Record<string, TextMessage[]> {
  const acc: Record<string, TextMessage[]> = { global: [] };
  messages.forEach((msg) => {
    const key = msg.attachToBlockType ?? "global";
    if (!acc[key]) acc[key] = [];
    acc[key].push(msg);
  });

  return acc;
}

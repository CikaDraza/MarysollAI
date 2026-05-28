import { TextMessage } from "@/types/ai/ai.text-engine";
import { ThreadItem } from "@/types/ai/chat-thread";
import { BaseBlock } from "@/types/landing-block";
import type { ChatEvent } from "@/lib/ai/events/chat-event-types";

const makeId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}`;

export const createThreadItems = (
  userInput: string,
  aiResponse: { messages: TextMessage[]; layout: BaseBlock[] },
  options: { includeUserMessage?: boolean } = {},
): ThreadItem[] => {
  const newItems: ThreadItem[] = [];
  const requestId = crypto.randomUUID();
  const isInternalSystemAction = /^system_action:/i.test(userInput.trim());
  const includeUserMessage =
    !isInternalSystemAction && (options.includeUserMessage ?? true);

  // 1. Dodajemo poruku korisnika samo za realan user input.
  if (includeUserMessage) {
    newItems.push({
      id: `user-${requestId}`,
      type: "message",
      data: {
        id: `msg-u-${requestId}`,
        role: "user",
        content: userInput,
        timestamp: Date.now(),
        attachToBlockType: "none",
      },
    });
  }

  // 2. Prolazimo kroz poruke asistenta i blokove i spajamo ih linearno
  aiResponse.messages.forEach((msg, index) => {
    const msgId = `msg-a-${requestId}-${index}`;

    // Dodajemo poruku asistenta
    newItems.push({
      id: msgId,
      type: "message",
      data: {
        ...msg,
        id: msgId,
        timestamp: Date.now(),
      },
    });

    // 3. UPARIVANJE BLOKA SA PORUKOM
    if (msg.attachToBlockType && msg.attachToBlockType !== "none") {
      const rawBlock = aiResponse.layout.find(
        (b) => b.type === msg.attachToBlockType,
      );

      if (rawBlock) {
        const blockId = { ...rawBlock, id: `block-${requestId}-${index}` };
        newItems.push({
          id: blockId.id,
          type: "block",
          data: blockId,
        });
      }
    }
  });

  return newItems;
};

export function createThreadItemsFromChatEvent(event: ChatEvent): ThreadItem[] {
  if (event.type === "user_message") {
    const requestId = makeId();
    return [
      {
        id: `user-${requestId}`,
        type: "message",
        data: {
          id: `msg-u-${requestId}`,
          role: "user",
          content: event.content,
          timestamp: event.timestamp,
          attachToBlockType: "none",
        },
      },
    ];
  }

  if (event.type === "ai_response" && event.visibleInThread === true) {
    const requestId = makeId();
    return [
      {
        id: `assistant-${requestId}`,
        type: "message",
        data: {
          id: `msg-a-${requestId}`,
          role: "assistant",
          content: event.content,
          timestamp: event.timestamp,
          attachToBlockType: event.attachToBlockType,
        },
      },
    ];
  }

  return [];
}

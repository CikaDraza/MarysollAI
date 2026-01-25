import { TextMessage } from "@/types/ai/ai.text-engine";
import { ThreadItem } from "@/types/ai/chat-thread";
import { BaseBlock } from "@/types/landing-block";

export const createThreadItems = (
  userInput: string,
  aiResponse: { messages: TextMessage[]; layout: BaseBlock[] },
): ThreadItem[] => {
  const newItems: ThreadItem[] = [];
  const requestId = crypto.randomUUID();

  // 1. Dodajemo poruku korisnika
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

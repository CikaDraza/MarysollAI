"use client";

import { TextMessage } from "@/types/ai/ai.text-engine";
import TextBlock from "../blocks/TextBlock";
import { IMessage } from "@/types/ai/chat-thread";

interface TextEngineProps {
  messages: TextMessage[] | IMessage | TextMessage;
}

export function TextEngine({ messages }: TextEngineProps) {
  const msgsArray = Array.isArray(messages) ? messages : [messages];
  if (msgsArray.length === 0) return null;

  return (
    <div className="space-y-3">
      {msgsArray.map((msg, i) => (
        <TextBlock
          key={msg.id || i}
          block={{
            id: msg.id,
            role: msg.role,
            type: "TextBlock",
            content: msg.content,
          }}
        />
      ))}
    </div>
  );
}

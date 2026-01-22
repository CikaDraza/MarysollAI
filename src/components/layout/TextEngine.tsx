"use client";

import { TextMessage } from "@/types/ai/ai.text-engine";
import TextBlock from "../blocks/TextBlock";

interface TextEngineProps {
  messages: TextMessage[];
}

export function TextEngine({ messages }: TextEngineProps) {
  if (!messages.length) return null;

  return (
    <div className="space-y-3 mb-6">
      {messages.map((msg, i) => (
        <TextBlock
          key={i}
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

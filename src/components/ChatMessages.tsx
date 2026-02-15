// ChatMessages.tsx
import React, { useMemo } from "react";
import clsx from "clsx";

interface Message {
  role: "user" | "assistant";
  text: string;
}

interface Props {
  messages: Message[];
}

export default function ChatMessages({ messages }: Props) {
  const messageComponents = useMemo(() => {
    return messages.map((message, index) => (
      <div
        key={index}
        className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
      >
        <p
          className={clsx(
            "max-w-[80%] p-2 text-sm/6 rounded-lg text-gray-700 md:col-span-2 sm:mt-0",
            message.role === "user"
              ? "w-sm ml-auto bg-(--secondary-color) text-white"
              : "mr-auto",
          )}
        >
          {message.text}
        </p>
      </div>
    ));
  }, [messages]);

  return <div className="space-y-4 mb-8">{messageComponents}</div>;
}

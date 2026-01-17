"use client";

import { useCallback, useState } from "react";
import { TextMessage } from "@/types/ai/ai.text-engine";
import { BaseBlock } from "@/types/landing-block";

interface AITextResponse {
  messages: TextMessage[];
}

interface AILayoutResponse {
  layout: BaseBlock[];
}

export async function retry<T>(
  fn: () => Promise<T>,
  retries = 2,
  delayMs = 600,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    await new Promise((r) => setTimeout(r, delayMs));
    return retry(fn, retries - 1, delayMs * 1.5);
  }
}

export function useAIQuery() {
  const [messages, setMessages] = useState<TextMessage[]>([]);
  const [runtimeBlocks, setRuntimeBlocks] = useState<BaseBlock[]>([]);

  const [isTextLoading, setIsTextLoading] = useState(false);
  const [isLayoutLoading, setIsLayoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Append-only, nikad replace
   */
  const appendMessages = useCallback((incoming: TextMessage[]) => {
    setMessages((prev) => [...prev, ...incoming]);
  }, []);

  /**
   * Glavna akcija koju zove UI
   */
  const askAI = useCallback(
    async (prompt: string) => {
      setError(null);

      // 1. Conversational AI
      try {
        setIsTextLoading(true);

        const textRes = await fetch("/api/ai/conversation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: prompt }),
        });

        const textData = (await textRes.json()) as AITextResponse;
        appendMessages(textData.messages);
      } catch {
        setError("Failed to fetch AI text response");
        return; // ⛔ ako tekst padne, layout nema smisla
      } finally {
        setIsTextLoading(false);
      }

      // 2. Layout suggestion (NE BLOKIRA tekst)
      try {
        setIsLayoutLoading(true);

        const layoutData = await retry<AILayoutResponse>(
          async () => {
            const res = await fetch("/api/ai/layout", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: prompt }),
            });

            if (!res.ok) throw new Error("Layout request failed");
            return res.json();
          },
          2, // retries
          700, // initial delay
        );

        setRuntimeBlocks(layoutData.layout);
      } catch (e: unknown) {
        console.error({
          e: e instanceof Error && "Failed to fetch AI layout suggestion",
        });
        setError("Failed to fetch AI layout suggestion");
      } finally {
        setIsLayoutLoading(false);
      }
    },
    [appendMessages],
  );

  return {
    askAI,

    // data
    messages,
    runtimeBlocks,

    // state
    isTextLoading,
    isLayoutLoading,
    error,
  };
}

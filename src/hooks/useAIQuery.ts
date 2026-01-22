"use client";

import { useCallback, useState } from "react";
import { TextMessage } from "@/types/ai/ai.text-engine";
import { BaseBlock } from "@/types/landing-block";
import { requiresLayout } from "@/lib/ai/intent-heuristics";

interface AITextResponse {
  messages: TextMessage[];
}

const layoutCache = new Map<string, BaseBlock[]>();

function hashIntent(text: string) {
  return text.trim().toLowerCase();
}

function sameLayout(a: BaseBlock[], b: BaseBlock[]) {
  if (a.length !== b.length) return false;
  return a.every((block, i) => block.type === b[i].type);
}

// interface AILayoutResponse {
//   layout: BaseBlock[];
// }

// export async function retry<T>(
//   fn: () => Promise<T>,
//   retries = 2,
//   delayMs = 600,
// ): Promise<T> {
//   try {
//     return await fn();
//   } catch (err) {
//     if (retries <= 0) throw err;
//     await new Promise((r) => setTimeout(r, delayMs));
//     return retry(fn, retries - 1, delayMs * 1.5);
//   }
// }

export function useAIQuery() {
  const [messages, setMessages] = useState<TextMessage[]>([]);
  const [runtimeBlocks, setRuntimeBlocks] = useState<BaseBlock[]>([]);

  const [isTextLoading, setIsTextLoading] = useState(false);
  const [isLayoutLoading, setIsLayoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Append-only, nikad replace
   */
  const appendMessages = useCallback((incoming?: TextMessage[]) => {
    if (!incoming) return; // ✅ Guard clause: ako nema poruka, ne radi ništa
    setMessages((prev) => [...prev, ...incoming]);
  }, []);

  /**
   * Glavna akcija koju zove UI
   */
  const askAI = useCallback(
    async (prompt: string) => {
      setError(null);
      appendMessages([
        {
          id: crypto.randomUUID(),
          type: "text",
          role: "user",
          content: prompt,
        },
      ]);
      setIsTextLoading(true);
      setIsLayoutLoading(true);
      // 1. Conversational AI
      try {
        const textRes = await fetch("/api/ai/conversation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: prompt }),
        });

        if (textRes.ok) {
          const textData = (await textRes.json()) as AITextResponse;
          appendMessages(textData.messages);
        }
        setIsTextLoading(false);
        // 2. Layout suggestion (NE BLOKIRA tekst)
        try {
          const key = hashIntent(prompt);
          if (layoutCache.has(key)) {
            setRuntimeBlocks(layoutCache.get(key)!);
          } else {
            if (requiresLayout(prompt)) {
              const layoutRes = await fetch("/api/ai/layout", {
                method: "POST",
                body: JSON.stringify({ message: prompt }),
              });
              if (layoutRes.ok) {
                const layoutData = await layoutRes.json();
                if (layoutData?.layout) {
                  if (!sameLayout(runtimeBlocks, layoutData.layout)) {
                    setRuntimeBlocks(layoutData.layout);
                  }
                }
              }
            }
          }
        } catch (e: unknown) {
          const errorMessage =
            e instanceof Error ? e.message : "Unknown AI error";
          console.error("AI Query Error:", errorMessage);
          setError(errorMessage);
        } finally {
          setIsLayoutLoading(false);
        }
      } catch (e: unknown) {
        const errorMessage =
          e instanceof Error ? e.message : "Unknown AI error";
        setError(errorMessage);
        return; // ⛔ ako tekst padne, layout nema smisla
      } finally {
        setIsTextLoading(false);
      }
    },
    [appendMessages, runtimeBlocks],
  );
  console.log({ set_blocks: runtimeBlocks });
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

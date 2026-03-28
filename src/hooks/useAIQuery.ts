// src/hooks/useAIQuery.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AuthUser } from "@/types/auth-types";
import { createThreadItems } from "@/lib/ai/createThreadItems";
import { useChatHistory } from "./useChatHistory";
import partialParse from "partial-json-parser";
import { TextMessage } from "@/types/ai/ai.text-engine";
import { BaseBlock } from "@/types/landing-block";
import { ThreadItem } from "@/types/ai/chat-thread";

interface PartialAIResponse {
  messages?: Pick<TextMessage, "content">[];
  layout?: unknown[];
}

interface AIResponseData {
  messages: TextMessage[];
  layout: BaseBlock[];
}

interface PendingResponse {
  query: string;
  data: AIResponseData;
}

interface AskAIOptions {
  context?: ThreadItem[];
  preserveHistory?: boolean;
  // ✅ Dodajemo eksplicitne auth podatke
  explicitAuth?: {
    isAuthenticated: boolean;
    userName: string;
  };
}

export function useAIQuery(user?: AuthUser | null) {
  const {
    thread,
    saveToHistory,
    updateThread: setThread,
    clearHistory,
  } = useChatHistory();

  // ✅ Ref za user sa trenutnim podacima
  const userRef = useRef(user);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isTextLoading, setIsTextLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targetTextRef = useRef("");
  const isNetworkDoneRef = useRef(false);
  const activeTempIdRef = useRef<string | null>(null);
  const [pendingResponse, setPendingResponse] =
    useState<PendingResponse | null>(null);

  // ✅ Odmah ažuriraj ref kada se user promeni
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const finishQuery = useCallback(() => {
    if (!pendingResponse) return;
    const newElements = createThreadItems(
      pendingResponse.query,
      pendingResponse.data,
    );
    setThread((prev) => {
      const filtered = prev.filter((i) => i.id !== activeTempIdRef.current);
      const updated = [...filtered, ...newElements];
      saveToHistory(updated);
      return updated;
    });

    setIsStreaming(false);
    setIsTextLoading(false);
    setPendingResponse(null);
    setStreamingText("");
    activeTempIdRef.current = null;
  }, [pendingResponse, saveToHistory, setThread]);

  useEffect(() => {
    if (!isStreaming) return;

    const timer = setInterval(() => {
      setStreamingText((prev) => {
        const target = targetTextRef.current;

        if (prev.length >= target.length && isNetworkDoneRef.current) {
          clearInterval(timer);
          setTimeout(() => {
            finishQuery();
          }, 600);
          return prev;
        }

        if (prev.length < target.length) {
          return target.slice(0, prev.length + 1);
        }
        return prev;
      });
    }, 30);

    return () => clearInterval(timer);
  }, [isStreaming, finishQuery]);

  const askAI = useCallback(
    async (query: string, options?: AskAIOptions) => {
      if (isStreaming) return;

      const currentId = `temp-${crypto.randomUUID()}`;
      activeTempIdRef.current = currentId;

      setIsStreaming(true);
      setIsTextLoading(true);
      isNetworkDoneRef.current = false;
      setStreamingText("");
      targetTextRef.current = "";
      setError(null);

      // ✅ Koristi eksplicitne auth podatke ako su prosleđeni, inače iz ref-a
      const currentUser = userRef.current;
      const isAuthenticated =
        options?.explicitAuth?.isAuthenticated ?? !!currentUser;
      const userName =
        options?.explicitAuth?.userName ?? currentUser?.name ?? "Gost";

      setThread((prev) => [
        ...prev,
        {
          id: currentId,
          type: "message",
          data: {
            id: "temp",
            role: "user",
            content: query,
            timestamp: Date.now(),
          },
        },
      ]);

      try {
        const historyToSend = options?.context || thread;

        const response = await fetch("/api/ai/conversation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: query,
            isAuthenticated,
            userName,
            history: historyToSend,
          }),
        });

        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullRaw = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          fullRaw += chunk;

          try {
            const partialData = partialParse(fullRaw) as PartialAIResponse;
            targetTextRef.current =
              partialData?.messages?.map((m) => m.content).join("\n\n") || "";
          } catch (err: unknown) {
            // Ignorišem parsiranje u toku stream-a
          }
        }

        const cleanRaw = fullRaw
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim();

        const finalData = JSON.parse(cleanRaw) as AIResponseData;
        if (finalData && Array.isArray(finalData.messages)) {
          setPendingResponse({ query, data: finalData });
          isNetworkDoneRef.current = true;
        } else {
          throw new Error("Invalid AI Response Format");
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Greška";
        setError(errorMessage);
        setIsStreaming(false);
        setIsTextLoading(false);
        isNetworkDoneRef.current = false;
        setThread((prev) =>
          prev.filter((i) => i.id !== activeTempIdRef.current),
        );
      }
    },
    [isStreaming, setThread, thread],
  );

  const retry = useCallback(async () => {
    const lastUserMessage = [...thread]
      .reverse()
      .find((item) => item.type === "message" && item.data.role === "user");

    if (lastUserMessage && lastUserMessage.type === "message") {
      setError(null);
      setThread((prev) => prev.filter((i) => i.id !== lastUserMessage.id));

      // ✅ Koristi trenutne auth podatke pri retry-ju
      await askAI(lastUserMessage.data.content, {
        explicitAuth: {
          isAuthenticated: !!userRef.current,
          userName: userRef.current?.name || "Gost",
        },
      });
    }
  }, [thread, askAI, setThread]);

  return {
    askAI,
    thread,
    retry,
    streamingText,
    isStreaming,
    isTextLoading,
    error,
    resetError: () => setError(null),
    clearChat: clearHistory,
  };
}

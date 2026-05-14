// src/hooks/useAIQuery.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AuthUser } from "@/types/auth-types";
import { createThreadItems } from "@/lib/ai/createThreadItems";
import { useChatHistory, setGlobalStreaming } from "./useChatHistory";
import { TextMessage } from "@/types/ai/ai.text-engine";
import { BaseBlock } from "@/types/landing-block";
import { ThreadItem } from "@/types/ai/chat-thread";
import { bookingFlow } from "@/lib/ai/booking-flow-state";
import {
  parseClaudiaResponse,
  extractStreamingText,
} from "@/lib/ai/parseClaudiaResponse";

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
  explicitAuth?: {
    isAuthenticated: boolean;
    userName: string;
  };
  isBlockInteraction?: boolean;
  handoffPayload?: Record<string, unknown>;
}

export function useAIQuery(user?: AuthUser | null) {
  const {
    thread,
    saveToHistory,
    updateThread: setThread,
    clearHistory,
    claudiaStreaming,
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
    setGlobalStreaming({ isStreaming: false, text: "" });
  }, [pendingResponse, saveToHistory, setThread]);

  // Sync local streaming state to the global store — runs after render, never during
  useEffect(() => {
    setGlobalStreaming({ isStreaming, text: streamingText });
  }, [isStreaming, streamingText]);

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
      setGlobalStreaming({ isStreaming: true, text: "" });

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
        const suppressStreamingText =
          options?.handoffPayload?.intent === "create_booking" ||
          options?.handoffPayload?.intent === "resume_booking_after_login" ||
          options?.handoffPayload?.intent === "select_city" ||
          options?.handoffPayload?.intent === "select_salon" ||
          options?.handoffPayload?.intent === "appointments" ||
          options?.handoffPayload?.intent === "prices" ||
          options?.handoffPayload?.intent === "login" ||
          options?.handoffPayload?.intent === "login_for_booking";

        // Phase 1.5: forward bookingFlow snapshot so Claudia inherits memory.
        const bookingMemory = bookingFlow.get().collected;

        const response = await fetch("/api/ai/conversation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: query,
            isAuthenticated,
            userName,
            history: historyToSend,
            isBlockInteraction: options?.isBlockInteraction ?? false,
            bookingMemory,
            handoffPayload: options?.handoffPayload,
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

          // Streaming partial-text extraction — never throws.
          if (!suppressStreamingText) {
            targetTextRef.current = extractStreamingText(fullRaw);
          }
        }

        // Hardened parse: always returns a valid ClaudiaResponse, even on
        // malformed JSON or empty stream. Caller doesn't need a try/catch.
        const finalData = parseClaudiaResponse(fullRaw);
        setPendingResponse({ query, data: finalData });
        isNetworkDoneRef.current = true;
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Greška";
        setError(errorMessage);
        setIsStreaming(false);
        setIsTextLoading(false);
        isNetworkDoneRef.current = false;
        setGlobalStreaming({ isStreaming: false, text: "" });
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
    claudiaStreaming,
  };
}

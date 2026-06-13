// src/hooks/useAIQuery.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AuthUser } from "@/types/auth-types";
import { createThreadItems } from "@/lib/ai/createThreadItems";
import { sanitizeVisibleAgentMessage } from "@/lib/ai/communication/agent-communication-rules";
import { useChatHistory, setGlobalStreaming } from "./useChatHistory";
import { TextMessage } from "@/types/ai/ai.text-engine";
import { BaseBlock } from "@/types/landing-block";
import { ThreadItem } from "@/types/ai/chat-thread";
import { bookingFlow } from "@/lib/ai/booking-flow-state";
import { getEpisodeIdentity } from "@/lib/ai/memory/conversation-session";
import { markClaudiaActivity } from "@/lib/ai/claudia-activity";
import {
  createClaudiaFrameReader,
  type ClaudiaStreamFrame,
} from "@/lib/ai/sse-frames";
import {
  parseClaudiaResponse,
  extractStreamingText,
  extractBookingMemory,
  extractClearedFields,
} from "@/lib/ai/parseClaudiaResponse";

interface AIResponseData {
  messages: TextMessage[];
  layout: BaseBlock[];
}

interface PendingResponse {
  query: string;
  data: AIResponseData;
  suppressUserMessage?: boolean;
}

function suppressDuplicateAssistantMessages(
  prev: ThreadItem[],
  incoming: ThreadItem[],
): ThreadItem[] {
  const lastAssistant = [...prev]
    .reverse()
    .find((item) => item.type === "message" && item.data.role === "assistant");
  if (!lastAssistant || lastAssistant.type !== "message") return incoming;

  const skipBlockIds = new Set<string>();
  const filtered: ThreadItem[] = [];

  for (let index = 0; index < incoming.length; index++) {
    const item = incoming[index];
    if (
      item.type === "message" &&
      item.data.role === "assistant" &&
      item.data.content === lastAssistant.data.content &&
      Math.abs(item.data.timestamp - lastAssistant.data.timestamp) <= 2_000
    ) {
      const next = incoming[index + 1];
      if (next?.type === "block") skipBlockIds.add(next.id);
      continue;
    }
    if (skipBlockIds.has(item.id)) continue;
    filtered.push(item);
  }

  return filtered;
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
  suppressUserMessage?: boolean;
  /** User's known city (header/profile/GPS) — lets Claudia answer "nearest
   * salon" directly instead of re-asking for the city. */
  userCity?: string;
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
      { includeUserMessage: !pendingResponse.suppressUserMessage },
    );
    setThread((prev) => {
      const filtered = prev.filter((i) => i.id !== activeTempIdRef.current);
      const dedupedElements = suppressDuplicateAssistantMessages(
        filtered,
        newElements,
      );
      const updated = [...filtered, ...dedupedElements];
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

      if (!options?.suppressUserMessage) {
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
      }

      try {
        const historyToSend = options?.context || thread;
        const authToken =
          typeof window !== "undefined"
            ? localStorage.getItem("assistant_token")
            : null;
        // Suppress typewriter animation for all structured handoff responses.
        // Streaming text is only meaningful for conversational LLM output (no handoffPayload).
        const suppressStreamingText = !!options?.handoffPayload;

        // Phase 1.5: forward bookingFlow snapshot so Claudia inherits memory.
        const bookingMemory = bookingFlow.get().collected;

        // Faza 6: episode identity so Claudia can recall past structured
        // episodes ("prošli put ste tražili...") and write new ones server-side.
        const { conversationId, guestSessionId } = getEpisodeIdentity();

        const response = await fetch("/api/ai/conversation", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({
            message: query,
            isAuthenticated,
            userName,
            history: historyToSend,
            isBlockInteraction: options?.isBlockInteraction ?? false,
            bookingMemory,
            handoffPayload: options?.handoffPayload,
            userCity: options?.userCity,
            conversationId,
            guestSessionId,
          }),
        });

        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        // Faza 7 — framed SSE: "status" okviri pre spore operacije, pa "final".
        const frames = createClaudiaFrameReader();
        let finalRaw = "";

        const applyFrame = (frame: ClaudiaStreamFrame) => {
          // Svaki okvir je dokaz da Claudia radi → resetuje timeout budžet.
          markClaudiaActivity();
          if (frame.type === "status") {
            // Status ide u transient streaming bubble, mimo typewriter-a
            // (targetTextRef ostaje prazan dok ne stigne final) i NE upisuje se
            // u istoriju.
            setIsTextLoading(false);
            setStreamingText(frame.message);
          } else {
            finalRaw = JSON.stringify(frame.response ?? {});
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          for (const frame of frames.push(decoder.decode(value, { stream: true }))) {
            applyFrame(frame);
          }
        }
        for (const frame of frames.flush()) applyFrame(frame);

        // Final source: framed `final` payload, else raw body (rate-limit /
        // error responses are plain ClaudiaResponse JSON, not framed).
        const fullRaw = frames.sawFrame() ? finalRaw : frames.rest();

        // Now that the real answer is in, retype it cleanly from the status
        // bubble. Suppressed handoffs skip the typewriter (targetTextRef "").
        setStreamingText("");
        targetTextRef.current = suppressStreamingText
          ? ""
          : extractStreamingText(fullRaw);

        // Hardened parse: always returns a valid ClaudiaResponse, even on
        // malformed JSON or empty stream. Caller doesn't need a try/catch.
        const finalData = parseClaudiaResponse(fullRaw);

        // Faza 4 — correction flow: PRVO obriši povučena polja (revoke), pa
        // tek onda upiši nove vrednosti — inače stara vrednost iz localStorage
        // preživi merge i sledeća pretraga je ponovo koristi.
        const clearedFields = extractClearedFields(fullRaw);
        if (clearedFields.length > 0) {
          bookingFlow.get().clearFields(clearedFields);
        }

        // Phase A — unified memory: persist whatever Claudia resolved this turn
        // (city/service/time/salon) into the single source of truth so the next
        // message keeps `hasContext` and doesn't collapse into a reset fallback.
        const resolvedMemory = extractBookingMemory(fullRaw);
        if (Object.keys(resolvedMemory).length > 0) {
          bookingFlow.get().collect(resolvedMemory);
        }

        // Korekcija poništava i blokove iz pogrešnog pokušaja — bump čini
        // njihove select_* handoff-ove zastarelim (isStaleSelectionHandoff).
        if (clearedFields.length > 0) {
          bookingFlow.get().bumpFlowVersion("correction_cleared");
        }

        setPendingResponse({
          query,
          data: finalData,
          suppressUserMessage: options?.suppressUserMessage,
        });
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

  const appendAssistantMessage = useCallback(
    (content: string) => {
      const trimmed = sanitizeVisibleAgentMessage(content, "claudia");
      if (!trimmed) return;
      const id = `handoff-${crypto.randomUUID()}`;
      const item: ThreadItem = {
        id,
        type: "message",
        data: {
          id,
          role: "assistant",
          content: trimmed,
          timestamp: Date.now(),
        },
      };
      setThread((prev) => {
        const updated = [...prev, item];
        saveToHistory(updated);
        return updated;
      });
    },
    [saveToHistory, setThread],
  );

  const appendLocalExchange = useCallback(
    (query: string, response: string) => {
      const userText = query.trim();
      const assistantText = sanitizeVisibleAgentMessage(response, "claudia");
      if (!userText && !assistantText) return;
      const now = Date.now();
      const userId = `local-user-${crypto.randomUUID()}`;
      const assistantId = `local-assistant-${crypto.randomUUID()}`;
      const items: ThreadItem[] = [
        ...(userText
          ? [{
              id: userId,
              type: "message" as const,
              data: {
                id: userId,
                role: "user" as const,
                content: userText,
                timestamp: now,
              },
            }]
          : []),
        ...(assistantText
          ? [{
              id: assistantId,
              type: "message" as const,
              data: {
                id: assistantId,
                role: "assistant" as const,
                content: assistantText,
                timestamp: now + 1,
              },
            }]
          : []),
      ];
      setThread((prev) => {
        const updated = [...prev, ...items];
        saveToHistory(updated);
        return updated;
      });
    },
    [saveToHistory, setThread],
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
    appendAssistantMessage,
    appendLocalExchange,
  };
}

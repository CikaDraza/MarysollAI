// hooks/useChatSeek.ts
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { chatEvents } from "@/lib/ai/events/chatEvents";
import {
  AgentCallMetadata,
  AgentCallEvent,
  AgentType,
} from "@/types/ai/deepseek/agent-call";
import { parseMariaResponse } from "@/lib/ai/schemas/maria.schema";
import {
  StoredSession,
  StoredMessage,
  Message,
  ChatSession,
} from "@/types/ai/deepseek";
import { bookingFlow } from "@/lib/ai/booking-flow-state";
import { UsageStats } from "@/types/ai/deepseek/usage";
import { setLastAiUsage } from "@/lib/ai/usage-store";
import type { SearchResult } from "@/types/slots";
import type {
  AiBookingContact,
  AiBookingState,
} from "@/types/aiBooking";
import type { StructuredBookingIntent } from "@/types/intent";
import type { SearchRecoveryState } from "@/types/searchRecovery";

interface UseChatWithAIOptions {
  sessionId?: string;
  onError?: (error: Error) => void;
  onSuccess?: (message: Message, usage?: UsageStats) => void;
}

interface MutationResult {
  message: Message;
  usage: UsageStats;
  agentCall: AgentCallMetadata | null;
}

interface UseChatWithAIReturn {
  messages: Message[];
  sessions: ChatSession[];
  currentSession: ChatSession | null;
  isLoading: boolean;
  isSending: boolean;
  error: Error | null;
  isStreaming: boolean;
  /** Live token text from Maria while her SSE stream is in flight. Empty
   * once the stream closes and the message lands in the session. */
  streamingText: string;
  isEmpty: boolean;
  usage: UsageStats | null;
  showUsage: boolean;
  setShowUsage: (show: boolean) => void;
  sendMessage: (content: string) => Promise<void>;
  clearChat: () => void;
  retryLastMessage: () => Promise<void>;
  loadSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  getSessionTitle: (messages: Message[]) => string;
  createNewChat: () => void;
  appendLocalExchange: (query: string, response: string) => void;
}

/** Extract the (possibly incomplete) `message` field from a partial Maria
 * JSON string. Maria's content always has the shape
 * `{"type":"answer","message":"...","targetAgent":"..."}`. While the JSON is
 * still being streamed we lift out the message text using a tolerant regex
 * — full JSON.parse would throw on incomplete input. */
function extractPartialMariaMessage(rawSoFar: string): string {
  const match = rawSoFar.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (!match) return "";
  // Decode the standard JSON string escapes that DeepSeek can emit mid-stream.
  return match[1]
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

interface SSEDoneEventPayload {
  ok: boolean;
  message: string;
  intent?: StructuredBookingIntent;
  recoveryState?: SearchRecoveryState;
  slots?: SearchResult[];
  suggestions?: unknown[];
  selectedSlot?: SearchResult;
  aiBookingState?: AiBookingState;
  pendingContact?: AiBookingContact;
  aiDebug?: Record<string, unknown>;
  error?: string;
  choices: Array<{ message: { content: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  model?: string;
}

const CHAT_SESSIONS_KEY = "chat_sessions";
const MAX_SESSIONS = 10;
const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;

// Batch 5 (Phase A) — paced choreography. Maria's reply is often a hardcoded
// preflight string returned in < 50 ms by the route. Without a deliberate
// beat, the user sees "Maria's reply" and "Claudia's handoff message"
// rendered in the same paint, which reads as a single chaotic flash.
// These delays let the user actually parse Maria's sentence before
// the specialist takes over.

/** Minimum time the typing indicator stays visible while Maria "thinks".
 * Hardcoded preflight branches complete in ~30 ms; this floor makes them
 * feel deliberate. Real DeepSeek calls already take longer than this so
 * the delay is effectively a no-op for them. */
const MARIA_THINKING_FLOOR_MS = 350;

/** Pause between Maria's reply landing in the thread and the specialist
 * handoff firing. Tuned per agent type — booking does the heaviest follow-up
 * (search → render slots) so the lead-in is slightly longer. */
const HANDOFF_DELAYS: Record<AgentType, number> = {
  booking: 900,
  appointments: 600,
  prices: 600,
  auth: 600,
  testimonials: 600,
};
const HANDOFF_DELAY_FALLBACK_MS = 700;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useChatSeek(
  options: UseChatWithAIOptions = {},
): UseChatWithAIReturn {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(
    options.sessionId || null,
  );
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [showUsage, setShowUsage] = useState(false);
  // Phase B SSE — exposed so the chat UI can render Maria's reply as
  // tokens arrive instead of waiting for the assistant message to appear
  // in a single paint frame.
  const [streamingText, setStreamingText] = useState("");

  const abortControllerRef = useRef<AbortController | null>(null);
  // Batch 5 — pending handoff timer. Held in a ref so clearChat / abort
  // can cancel a scheduled CALL_AGENT emission if the user resets the
  // conversation during the deliberate pause.
  const handoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOfferedSlotsRef = useRef<SearchResult[]>([]);
  const selectedSlotRef = useRef<SearchResult | undefined>(undefined);
  const aiBookingStateRef = useRef<AiBookingState | undefined>(undefined);
  const lastIntentRef = useRef<StructuredBookingIntent | undefined>(undefined);
  const lastRecoveryStateRef = useRef<SearchRecoveryState | undefined>(undefined);
  const pendingContactRef = useRef<AiBookingContact | undefined>(undefined);
  const lastActivityAtRef = useRef<number>(Date.now());
  const queryClient = useQueryClient();

  const currentSession = currentSessionId
    ? sessions.find((s: ChatSession) => s.id === currentSessionId) || null
    : sessions[0] || null;

  const messages = useMemo(
    () => currentSession?.messages || [],
    [currentSession],
  );

  useEffect(() => {
    const saved = localStorage.getItem(CHAT_SESSIONS_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as StoredSession[];
      setSessions(
        parsed.map(
          (session: StoredSession): ChatSession => ({
            ...session,
            createdAt: new Date(session.createdAt),
            updatedAt: new Date(session.updatedAt),
            messages: session.messages.map(
              (message: StoredMessage): Message => ({
                ...message,
                createdAt: new Date(message.createdAt),
              }),
            ),
          }),
        ),
      );
    } catch (error) {
      console.error("Failed to parse sessions:", error);
    }
  }, []);

  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(sessions));
    }
  }, [sessions]);

  const getSessionTitle = useCallback((messages: Message[]): string => {
    if (messages.length === 0) return "Nova konverzacija";
    const firstUserMessage = messages.find((m: Message) => m.role === "user");
    if (!firstUserMessage) return "Nova konverzacija";
    return (
      firstUserMessage.content.slice(0, 50) +
      (firstUserMessage.content.length > 50 ? "..." : "")
    );
  }, []);

  const generateId = () =>
    typeof window !== "undefined"
      ? crypto.randomUUID()
      : `server-${Math.random().toString(36).substring(7)}`;

  const createNewSession = useCallback((): ChatSession => {
    const newSession: ChatSession = {
      id: generateId(),
      title: "Nova konverzacija",
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setSessions((prev: ChatSession[]) => [newSession, ...prev].slice(0, MAX_SESSIONS));
    setCurrentSessionId(newSession.id);
    return newSession;
  }, []);

  const resetBookingContext = useCallback(() => {
    lastOfferedSlotsRef.current = [];
    selectedSlotRef.current = undefined;
    aiBookingStateRef.current = undefined;
    lastIntentRef.current = undefined;
    lastRecoveryStateRef.current = undefined;
    pendingContactRef.current = undefined;
    bookingFlow.get().reset();
  }, []);

  const updateSession = useCallback(
    (sessionId: string, updates: Partial<ChatSession>): void => {
      setSessions((prev: ChatSession[]) =>
        prev.map((s: ChatSession) =>
          s.id === sessionId ? { ...s, ...updates, updatedAt: new Date() } : s,
        ),
      );
    },
    [],
  );

  const loadSession = useCallback((sessionId: string): void => {
    setCurrentSessionId(sessionId);
    setUsage(null);
  }, []);

  const deleteSession = useCallback(
    (sessionId: string): void => {
      setSessions((prev: ChatSession[]) => {
        const filtered = prev.filter((s: ChatSession) => s.id !== sessionId);
        if (currentSessionId === sessionId) {
          setCurrentSessionId(filtered[0]?.id || null);
        }
        return filtered;
      });
    },
    [currentSessionId],
  );

  const sendMessageMutation = useMutation({
    mutationFn: async (newMessage: string): Promise<MutationResult> => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Cancel any pending handoff from a previous turn — a new user message
      // supersedes the prior handoff.
      if (handoffTimerRef.current) {
        clearTimeout(handoffTimerRef.current);
        handoffTimerRef.current = null;
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      const sendStartedAt = Date.now();

      try {
        const now = Date.now();
        const sessionIsStale =
          !!currentSession &&
          now - currentSession.updatedAt.getTime() > INACTIVITY_TIMEOUT_MS;

        let session = currentSession;
        if (!session || sessionIsStale) {
          resetBookingContext();
          session = createNewSession();
        }
        lastActivityAtRef.current = now;

        const userMessage: Message = {
          id: crypto.randomUUID(),
          role: "user",
          content: newMessage,
          createdAt: new Date(),
        };

        const updatedMessages = [...session.messages, userMessage];
        updateSession(session.id, {
          messages: updatedMessages,
          title: getSessionTitle(updatedMessages),
        });

        const response = await fetch("/api/ai/deepseek-conversation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: updatedMessages.map(({ role, content }: Message) => ({
              role,
              content,
            })),
            lastOfferedSlots: lastOfferedSlotsRef.current,
            selectedSlot: selectedSlotRef.current,
            aiBookingState: aiBookingStateRef.current,
            lastIntent: lastIntentRef.current,
            lastRecoveryState: lastRecoveryStateRef.current,
            pendingContact: pendingContactRef.current,
            // Model Lab — preferencija modela (server svejedno revalidira).
            selectedModelId:
              typeof window !== "undefined"
                ? (localStorage.getItem("marysoll_ai_model_id") ?? undefined)
                : undefined,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          // Pre-stream errors (route threw before opening the SSE) still come
          // back as plain JSON. Errors *during* the stream are sent as the
          // "done" event with payload.error set, and don't land here.
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || "Failed to send message");
        }
        if (!response.body) {
          throw new Error("SSE response has no body");
        }

        // Phase B SSE — consume Maria's token + done event protocol.
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulatedContent = "";
        let data: SSEDoneEventPayload | null = null;
        setStreamingText("");

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split("\n\n");
            buffer = frames.pop() ?? "";
            for (const frame of frames) {
              const line = frame.trim();
              if (!line.startsWith("data:")) continue;
              const json = line.slice(5).trim();
              if (!json) continue;
              let evt: { type?: string; delta?: string; payload?: SSEDoneEventPayload };
              try {
                evt = JSON.parse(json);
              } catch {
                continue;
              }
              if (evt.type === "token" && typeof evt.delta === "string") {
                accumulatedContent += evt.delta;
                // Surface a partial `message` field as it grows so the chat
                // UI can render Maria's reply token-by-token.
                setStreamingText(extractPartialMariaMessage(accumulatedContent));
              } else if (evt.type === "done" && evt.payload) {
                data = evt.payload;
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        if (!data) {
          throw new Error("SSE stream closed without done event");
        }

        if (Array.isArray(data.slots) && data.slots.length > 0) {
          lastOfferedSlotsRef.current = data.slots as SearchResult[];
        }
        if (data.selectedSlot) {
          selectedSlotRef.current = data.selectedSlot as SearchResult;
        }
        if (data.aiBookingState) {
          aiBookingStateRef.current = data.aiBookingState as AiBookingState;
        }
        if (data.intent) {
          lastIntentRef.current = data.intent as StructuredBookingIntent;
        }
        if (data.recoveryState) {
          lastRecoveryStateRef.current = data.recoveryState as SearchRecoveryState;
        }
        if (data.pendingContact) {
          pendingContactRef.current = data.pendingContact as AiBookingContact;
        }
        const rawContent: string = data.choices?.[0]?.message?.content ?? "{}";

        // Single canonical shape via Zod-validated parser. Server already
        // normalizes, but parse client-side too so the contract is enforced
        // at every boundary.
        const mariaResponse = parseMariaResponse(rawContent);
        const replyText = mariaResponse.message;

        const usageData: UsageStats = {
          inputTokens: data.usage?.prompt_tokens || 0,
          outputTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
          modelVersion: data.model,
        };
        setUsage(usageData);

        // Model Lab — globalni usage store (overlay u UsageStats). Provider/cena
        // dolaze iz aiDebug-a (server izračunao), tokeni iz usage-a.
        const aiDebug = data.aiDebug as
          | { provider?: string; estimatedCostUsd?: number | null }
          | undefined;
        setLastAiUsage({
          provider: aiDebug?.provider,
          model: data.model,
          inputTokens: usageData.inputTokens,
          outputTokens: usageData.outputTokens,
          totalTokens: usageData.totalTokens,
          estimatedCostUsd: aiDebug?.estimatedCostUsd ?? null,
        });

        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: replyText,
          createdAt: new Date(),
        };

        const agentCall: AgentCallMetadata | null =
          mariaResponse.type === "handoff" && mariaResponse.targetAgent !== "none"
            ? {
                type: mariaResponse.targetAgent as AgentType,
                originalMessage: replyText,
                originalUserMessage: newMessage,
                userIntent: mariaResponse.targetAgent,
                timestamp: Date.now(),
                payload: (mariaResponse.payload ?? {}) as Record<string, unknown>,
                history: updatedMessages,
              }
            : null;

        // Maria "thinking" floor — hardcoded preflight branches return in
        // ~30 ms which paints unnaturally fast. Pad to a deliberate floor
        // so the typing indicator (isSending) feels intentional. Real
        // DeepSeek calls already exceed this floor and pay no extra cost.
        const elapsed = Date.now() - sendStartedAt;
        if (elapsed < MARIA_THINKING_FLOOR_MS) {
          await sleep(MARIA_THINKING_FLOOR_MS - elapsed);
        }

        return { message: assistantMessage, usage: usageData, agentCall };
      } finally {
        abortControllerRef.current = null;
      }
    },
    onSuccess: ({ message, usage, agentCall }: MutationResult) => {
      // Streaming text was a preview of `message.content`; once the message
      // is appended to the session we don't need it any more.
      setStreamingText("");
      if (currentSession) {
        updateSession(currentSession.id, {
          messages: [...currentSession.messages, message],
          title: getSessionTitle([...currentSession.messages, message]),
        });
      }

      if (agentCall) {
        const callEvent: AgentCallEvent = {
          type: "CALL_AGENT",
          payload: {
            agentType: agentCall.type,
            userMessage: agentCall.originalMessage,
            originalUserMessage: agentCall.originalUserMessage,
            history: (agentCall.history ?? messages).map(({ id, role, content, createdAt }) => ({
              id,
              role,
              content,
              createdAt,
            })),
            sessionId: currentSession?.id,
            handoffPayload: agentCall.payload,
          },
          timestamp: Date.now(),
        };
        // Defer the handoff so the user has time to read Maria's sentence
        // before the specialist takes over. Without this pause, Maria's
        // reply and Claudia's first message land in the same paint frame
        // and read as a single chaotic flash.
        const delay =
          HANDOFF_DELAYS[agentCall.type] ?? HANDOFF_DELAY_FALLBACK_MS;
        handoffTimerRef.current = setTimeout(() => {
          handoffTimerRef.current = null;
          chatEvents.emit(callEvent);
        }, delay);
      }

      options.onSuccess?.(message, usage);
      queryClient.invalidateQueries({ queryKey: ["chat"] });
    },
    onError: (error: Error) => {
      setStreamingText("");
      if (currentSession) {
        updateSession(currentSession.id, {
          messages: currentSession.messages.slice(0, -1),
        });
      }
      options.onError?.(
        error instanceof Error ? error : new Error("Unknown error"),
      );
    },
  });

  const sendMessage = useCallback(
    async (content: string): Promise<void> => {
      if (!content.trim() || sendMessageMutation.isPending) return;
      await sendMessageMutation.mutateAsync(content);
    },
    [sendMessageMutation],
  );

  const appendLocalExchange = useCallback(
    (query: string, response: string): void => {
      const userText = query.trim();
      const assistantText = response.trim();
      if (!userText && !assistantText) return;

      let session = currentSession;
      if (!session) {
        session = createNewSession();
      }

      const nextMessages: Message[] = [
        ...session.messages,
        ...(userText
          ? [{
              id: generateId(),
              role: "user" as const,
              content: userText,
              createdAt: new Date(),
            }]
          : []),
        ...(assistantText
          ? [{
              id: generateId(),
              role: "assistant" as const,
              content: assistantText,
              createdAt: new Date(),
            }]
          : []),
      ];

      updateSession(session.id, {
        messages: nextMessages,
        title: getSessionTitle(nextMessages),
      });
      lastActivityAtRef.current = Date.now();
    },
    [createNewSession, currentSession, getSessionTitle, updateSession],
  );

  const clearChat = useCallback((): void => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (handoffTimerRef.current) {
      clearTimeout(handoffTimerRef.current);
      handoffTimerRef.current = null;
    }
    if (currentSession) {
      updateSession(currentSession.id, { messages: [] });
    }
    lastOfferedSlotsRef.current = [];
    selectedSlotRef.current = undefined;
    aiBookingStateRef.current = undefined;
    lastIntentRef.current = undefined;
    lastRecoveryStateRef.current = undefined;
    pendingContactRef.current = undefined;
    bookingFlow.get().reset();
    lastActivityAtRef.current = Date.now();
    setUsage(null);
    setStreamingText("");
  }, [currentSession, updateSession]);

  const retryLastMessage = useCallback(async (): Promise<void> => {
    const lastUserMessage = [...messages]
      .reverse()
      .find((m: Message) => m.role === "user");

    if (lastUserMessage && currentSession) {
      if (messages[messages.length - 1]?.role === "assistant") {
        updateSession(currentSession.id, { messages: messages.slice(0, -1) });
      }
      await sendMessage(lastUserMessage.content);
    }
  }, [messages, currentSession, updateSession, sendMessage]);

  const createNewChat = useCallback((): void => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (handoffTimerRef.current) {
      clearTimeout(handoffTimerRef.current);
      handoffTimerRef.current = null;
    }
    const newSession = createNewSession();
    setCurrentSessionId(newSession.id);
    lastOfferedSlotsRef.current = [];
    selectedSlotRef.current = undefined;
    aiBookingStateRef.current = undefined;
    lastIntentRef.current = undefined;
    lastRecoveryStateRef.current = undefined;
    pendingContactRef.current = undefined;
    bookingFlow.get().reset();
    lastActivityAtRef.current = Date.now();
    setUsage(null);
    setStreamingText("");
  }, [createNewSession]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (handoffTimerRef.current) {
        clearTimeout(handoffTimerRef.current);
      }
    };
  }, []);

  return {
    messages,
    sessions,
    currentSession,
    isLoading: false,
    isSending: sendMessageMutation.isPending,
    error: sendMessageMutation.error,
    isStreaming: sendMessageMutation.isPending,
    streamingText,
    isEmpty: messages.length === 0,
    usage,
    showUsage,
    setShowUsage,
    sendMessage,
    clearChat,
    retryLastMessage,
    loadSession,
    deleteSession,
    getSessionTitle,
    createNewChat,
    appendLocalExchange,
  };
}

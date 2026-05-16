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
}

const CHAT_SESSIONS_KEY = "chat_sessions";
const MAX_SESSIONS = 10;
const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;

export function useChatSeek(
  options: UseChatWithAIOptions = {},
): UseChatWithAIReturn {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(
    options.sessionId || null,
  );
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [showUsage, setShowUsage] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
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

      const controller = new AbortController();
      abortControllerRef.current = controller;

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
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error?.message || "Failed to send message");
        }

        const data = await response.json();
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

        return { message: assistantMessage, usage: usageData, agentCall };
      } finally {
        abortControllerRef.current = null;
      }
    },
    onSuccess: ({ message, usage, agentCall }: MutationResult) => {
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
        chatEvents.emit(callEvent);
      }

      options.onSuccess?.(message, usage);
      queryClient.invalidateQueries({ queryKey: ["chat"] });
    },
    onError: (error: Error) => {
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

  const clearChat = useCallback((): void => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
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
  }, [createNewSession]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
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
  };
}

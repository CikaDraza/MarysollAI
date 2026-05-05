"use client";

import {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAIQuery } from "@/hooks/useAIQuery";
import { useChatSeek } from "@/hooks/useChatSeek";
import type { ThreadItem } from "@/types/ai/chat-thread";
import { chatEvents, isAgentCallEvent } from "@/lib/ai/events/chatEvents";
import type { AgentType } from "@/types/ai/deepseek/agent-call";

export type ActiveAgent =
  | "maria"
  | "claudia-booking"
  | "claudia-auth"
  | "claudia-prices"
  | "claudia-appointments"
  | "claudia-testimonials";

const AGENT_MAP: Record<AgentType, ActiveAgent> = {
  booking: "claudia-booking",
  auth: "claudia-auth",
  prices: "claudia-prices",
  appointments: "claudia-appointments",
  testimonials: "claudia-testimonials",
};

interface AIContextValue {
  unifiedThread: ThreadItem[];
  sendMessage: (q: string) => void;
  clearChat: () => void;
  streamingText: string | undefined;
  isStreaming: boolean;
  streamingAgent: "maria" | "claudia";
  activeAgent: ActiveAgent;
  resetAgent: () => void;
}

const AIContext = createContext<AIContextValue | null>(null);

export function AIProvider({ children }: { children: ReactNode }) {
  const maria = useChatSeek();
  const claudia = useAIQuery(null);
  const [activeAgent, setActiveAgent] = useState<ActiveAgent>("maria");

  // Stable refs — event subscribers must not go stale
  const askClaudiaRef = useRef(claudia.askAI);
  useEffect(() => {
    askClaudiaRef.current = claudia.askAI;
  }, [claudia.askAI]);

  const activeAgentRef = useRef(activeAgent);
  useEffect(() => {
    activeAgentRef.current = activeAgent;
  }, [activeAgent]);

  // When Maria emits CALL_AGENT: switch ownership to Claudia and forward the query
  useEffect(() => {
    const unsubscribe = chatEvents.subscribe("CALL_AGENT", (event) => {
      if (!isAgentCallEvent(event)) return;

      const { agentType } = event.payload;
      setActiveAgent(AGENT_MAP[agentType] ?? "claudia-booking");

      const lastUserMsg = [...event.payload.history]
        .reverse()
        .find((m) => m.role === "user");

      const query = lastUserMsg?.content ?? event.payload.userMessage;
      void askClaudiaRef.current(query);
    });

    return unsubscribe;
  }, []);

  const unifiedThread = useMemo<ThreadItem[]>(() => {
    const mariaItems: ThreadItem[] = maria.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        id: `maria-${m.id}`,
        type: "message",
        data: {
          id: `maria-${m.id}`,
          role: m.role === "user" ? "user" : "assistant",
          content: m.content.replace(/\[CALL_AGENT:\w+\]/g, "").trim(),
          timestamp: m.createdAt.getTime(),
        },
      }));

    // Collect all user message contents from Maria to deduplicate the
    // forwarded CALL_AGENT query that Claudia receives as a user message.
    const mariaUserContents = new Set(
      mariaItems
        .filter((i) => i.type === "message" && i.data.role === "user")
        .map((i) => (i.type === "message" ? i.data.content : "")),
    );

    let lastTs = Date.now();
    const claudiaItems: Array<ThreadItem & { _ts: number }> = [];
    claudia.thread.forEach((item) => {
      if (item.type === "message") {
        if (item.data.role === "user") {
          // Skip the initial forwarded query (already shown via Maria).
          // Subsequent user messages sent directly to Claudia are NOT skipped.
          if (mariaUserContents.has(item.data.content)) return;
        }
        lastTs = item.data.timestamp;
        claudiaItems.push({ ...item, _ts: lastTs });
      } else {
        claudiaItems.push({ ...item, _ts: lastTs + 1 });
      }
    });

    const all: Array<ThreadItem & { _ts: number }> = [
      ...mariaItems.map((i) => ({
        ...i,
        _ts: i.type === "message" ? i.data.timestamp : Date.now(),
      })),
      ...claudiaItems,
    ];
    all.sort((a, b) => a._ts - b._ts);
    return all.map(({ _ts, ...rest }) => rest as ThreadItem);
  }, [maria.messages, claudia.thread]);

  // Routes new messages: Maria handles general chat, Claudia handles active workflows
  const sendMessage = useCallback(
    (q: string) => {
      if (activeAgentRef.current === "maria") {
        void maria.sendMessage(q);
      } else {
        void claudia.askAI(q);
      }
    },
    [maria, claudia],
  );

  const clearChat = useCallback(() => {
    maria.clearChat();
    claudia.clearChat();
    setActiveAgent("maria");
  }, [maria, claudia]);

  const resetAgent = useCallback(() => {
    setActiveAgent("maria");
  }, []);

  return (
    <AIContext.Provider
      value={{
        unifiedThread,
        sendMessage,
        clearChat,
        streamingText: claudia.streamingText ?? undefined,
        isStreaming: maria.isStreaming || claudia.isStreaming,
        streamingAgent: claudia.isStreaming ? "claudia" : "maria",
        activeAgent,
        resetAgent,
      }}
    >
      {children}
    </AIContext.Provider>
  );
}

export function useAIContext() {
  const ctx = useContext(AIContext);
  if (!ctx) throw new Error("useAIContext must be used within AIProvider");
  return ctx;
}

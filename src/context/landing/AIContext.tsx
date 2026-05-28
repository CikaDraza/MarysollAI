"use client";

import {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useAIQuery } from "@/hooks/useAIQuery";
import { useChatSeek } from "@/hooks/useChatSeek";
import type { ThreadItem } from "@/types/ai/chat-thread";
import { blockOrchestrator } from "@/lib/ai/block-orchestrator";
import {
  useAgentState,
  type ActiveAgent as StoreActiveAgent,
  type ClaudiaSubAgent,
} from "@/store/ai/agent-state";
import { resetAgentState } from "@/lib/ai/orchestrator/ai-orchestrator";
import {
  legacyActionTextToSystemAction,
} from "@/lib/ai/events/systemActionDispatcher";
import { bookingFlow } from "@/lib/ai/booking-flow-state";
import {
  acknowledgementReply,
  routeUserMessageToAgent,
} from "@/lib/ai/routing/agentEntryRouter";

// Public ActiveAgent for legacy consumers — derived from the Zustand store.
// Kept for backward compatibility with components reading `useAIContext().activeAgent`.
export type ActiveAgent =
  | "maria"
  | "claudia-booking"
  | "claudia-auth"
  | "claudia-prices"
  | "claudia-appointments"
  | "claudia-testimonials";

function deriveLegacyAgent(
  active: StoreActiveAgent,
  sub: ClaudiaSubAgent | null,
): ActiveAgent {
  if (active === "maria" || active === "idle") return "maria";
  if (active === "auth") return "claudia-auth";
  // active === "claudia"
  if (sub === "auth") return "claudia-auth";
  if (sub === "prices") return "claudia-prices";
  if (sub === "appointments") return "claudia-appointments";
  if (sub === "testimonials") return "claudia-testimonials";
  return "claudia-booking";
}

function isAuthIntentText(text: string): boolean {
  return /\b(login|prijavi|prijavim|uloguj|registruj|registracija|nalog|lozink)\b/i.test(
    text,
  );
}

function legacyAgentForClaudiaSub(sub: ClaudiaSubAgent | undefined): ActiveAgent {
  if (sub === "appointments") return "claudia-appointments";
  if (sub === "auth") return "claudia-auth";
  if (sub === "prices") return "claudia-prices";
  if (sub === "testimonials") return "claudia-testimonials";
  return "claudia-booking";
}

function hasCollectedBookingContext(): boolean {
  const collected = bookingFlow.get().collected;
  return Object.values(collected).some(
    (value) => value !== undefined && value !== null && value !== "",
  );
}

interface AIContextValue {
  unifiedThread: ThreadItem[];
  sendMessage: (q: string) => void;
  invokeClaudia: (
    q: string,
    options?: {
      context?: ThreadItem[];
      preserveHistory?: boolean;
      explicitAuth?: {
        isAuthenticated: boolean;
        userName: string;
      };
      handoffPayload?: Record<string, unknown>;
      suppressUserMessage?: boolean;
    },
  ) => Promise<void>;
  /** Routes directly to Claudia — use for block interaction callbacks. */
  sendToOrchestrator: (q: string, handoffPayload?: Record<string, unknown>) => void;
  clearChat: () => void;
  streamingText: string | undefined;
  isStreaming: boolean;
  streamingAgent: "maria" | "claudia";
  activeAgent: ActiveAgent;
  resetAgent: () => void;
}

const AIContext = createContext<AIContextValue | null>(null);
const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;

export function AIProvider({ children }: { children: ReactNode }) {
  const maria = useChatSeek();
  const claudia = useAIQuery(null);

  // Read agent state from the Zustand store — single source of truth.
  // Owner of writes: lib/ai/orchestrator (via AgentBridge handoff path).
  const storeActive = useAgentState((s) => s.activeAgent);
  const storeSub = useAgentState((s) => s.claudiaSubAgent);
  const setActiveAgentInStore = useAgentState((s) => s.setActiveAgent);
  const activeAgent = deriveLegacyAgent(storeActive, storeSub);

  // Ref tracks the current "is Maria active" decision for callbacks below.
  const activeAgentRef = useRef(activeAgent);
  useEffect(() => {
    activeAgentRef.current = activeAgent;
  }, [activeAgent]);

  const unifiedThread = useMemo<ThreadItem[]>(() => {
    const mariaItems: ThreadItem[] = maria.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        id: `maria-${m.id}`,
        type: "message",
        data: {
          id: `maria-${m.id}`,
          role: m.role === "user" ? "user" : "assistant",
          content: m.content,
          timestamp: m.createdAt.getTime(),
        },
      }));

    // Deduplicate forwarded user query — Claudia receives it as first user message
    const mariaUserContents = new Set(
      mariaItems
        .filter((i) => i.type === "message" && i.data.role === "user")
        .map((i) => (i.type === "message" ? i.data.content : "")),
    );

    let lastTs = Date.now();
    const claudiaItems: Array<ThreadItem & { _ts: number }> = [];
    claudia.thread.forEach((item) => {
      if (item.type === "message") {
        if (item.data.role === "user" && mariaUserContents.has(item.data.content)) return;
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

  const lastInteractionAt = useMemo(() => {
    for (let i = unifiedThread.length - 1; i >= 0; i--) {
      const item = unifiedThread[i];
      if (item.type === "message") return item.data.timestamp;
    }
    return 0;
  }, [unifiedThread]);

  const latestBlockType = useMemo(() => {
    for (let i = unifiedThread.length - 1; i >= 0; i--) {
      const item = unifiedThread[i];
      if (item.type === "block") return item.data.type;
    }
    return null;
  }, [unifiedThread]);

  const sendMessage = useCallback(
    (q: string) => {
      if (
        lastInteractionAt > 0 &&
        Date.now() - lastInteractionAt > INACTIVITY_TIMEOUT_MS
      ) {
        maria.clearChat();
        claudia.clearChat();
        blockOrchestrator.clear();
        resetAgentState();
        activeAgentRef.current = "maria";
      }

      const routingDecision = routeUserMessageToAgent({
        message: q,
        activeAgent: activeAgentRef.current === "maria" ? "maria" : "claudia",
        hasActiveBooking: hasCollectedBookingContext(),
      });

      console.debug("[AGENT_ENTRY_ROUTER]", {
        activeAgent: activeAgentRef.current,
        targetAgent: routingDecision.targetAgent,
        claudiaSubAgent: routingDecision.claudiaSubAgent,
        reason: routingDecision.reason,
      });

      if (routingDecision.reason === "acknowledgement") {
        const reply = acknowledgementReply(q);
        if (activeAgentRef.current === "maria") {
          maria.appendLocalExchange(q, reply);
        } else {
          claudia.appendLocalExchange(q, reply);
        }
        return;
      }

      if (routingDecision.targetAgent === "claudia") {
        const sub = routingDecision.claudiaSubAgent ?? "booking";
        setActiveAgentInStore("claudia", sub);
        activeAgentRef.current = legacyAgentForClaudiaSub(sub);
        if (latestBlockType === "AuthBlock" && isAuthIntentText(q)) {
          blockOrchestrator.focusBlock("AuthBlock");
          return;
        }
        void claudia.askAI(q);
        return;
      }

      if (activeAgentRef.current === "maria") {
        void maria.sendMessage(q);
      } else {
        if (latestBlockType === "AuthBlock" && isAuthIntentText(q)) {
          blockOrchestrator.focusBlock("AuthBlock");
          return;
        }
        setActiveAgentInStore("maria");
        activeAgentRef.current = "maria";
        void maria.sendMessage(q);
        if (routingDecision.transitionMessage) {
          window.setTimeout(() => {
            claudia.appendAssistantMessage(routingDecision.transitionMessage!);
          }, 20);
        }
      }
    },
    [maria, claudia, lastInteractionAt, latestBlockType, setActiveAgentInStore],
  );

  // Block interactions always go straight to Claudia with isBlockInteraction flag.
  // We flip the store directly (no orchestrator handoff needed — there's no
  // Maria response to sequence against here).
  const sendToOrchestrator = useCallback(
    (q: string, handoffPayload?: Record<string, unknown>) => {
      const mappedSystemAction = legacyActionTextToSystemAction(q, "LayoutEngine");
      if (mappedSystemAction) return;

      if (activeAgentRef.current === "maria") {
        setActiveAgentInStore("claudia", "booking");
      }
      void claudia.askAI(q, {
        isBlockInteraction: !handoffPayload,
        handoffPayload,
      });
    },
    [claudia, setActiveAgentInStore],
  );

  const clearChat = useCallback(() => {
    maria.clearChat();
    claudia.clearChat();
    blockOrchestrator.clear();
    resetAgentState();
  }, [maria, claudia]);

  const resetAgent = useCallback(() => {
    resetAgentState();
  }, []);

  return (
    <AIContext.Provider
      value={{
        unifiedThread,
        sendMessage,
        invokeClaudia: claudia.askAI,
        sendToOrchestrator,
        clearChat,
        // Phase B SSE — Maria now streams tokens too. Claudia wins when both
        // are technically streaming (handoff window) since her output is the
        // one the user is waiting on at that point.
        streamingText:
          claudia.streamingText ??
          (maria.streamingText ? maria.streamingText : undefined),
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

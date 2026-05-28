// components/chat-bus/AgentBridge.tsx
//
// Phase 1 — Deterministic handoff bridge.
//
// Previously: BOTH this component AND AIContext subscribed to "CALL_AGENT"
// and acted in parallel — the user-visible race condition where Maria's
// message and Claudia's stream appeared to fire simultaneously.
//
// Now: AgentBridge is the SINGLE owner of the handoff. It routes the event
// through `handleMariaResponse` (lib/ai/orchestrator/ai-orchestrator) which
// flips activeAgent state, persists payload to bookingFlow, then triggers
// Claudia sequentially.
"use client";

import { ReactNode, useEffect, useRef } from "react";
import { chatEvents, isAgentCallEvent } from "@/lib/ai/events/chatEvents";
import {
  isSystemActionEvent,
  type SystemActionEvent,
} from "@/lib/ai/events/chat-event-types";
import {
  logSystemActionEvent,
  shouldIgnoreSystemActionForRouting,
  systemActionToAgentRequest,
} from "@/lib/ai/events/systemActionDispatcher";
import { useAIQuery } from "@/hooks/useAIQuery";
import { useAuthActions } from "@/hooks/useAuthActions";
import { ThreadItem } from "@/types/ai/chat-thread";
import { Message as DeepSeekMessage } from "@/types/ai/deepseek";
import { AgentType } from "@/types/ai/deepseek/agent-call";
import { handleMariaResponse } from "@/lib/ai/orchestrator/ai-orchestrator";
import type { MariaTargetAgent } from "@/lib/ai/schemas/maria.schema";
import { executeUICommand } from "@/lib/ai/ui/ui-command-executor";

interface AgentBridgeProps {
  children: ReactNode;
  claudiaAskAI?: (
    query: string,
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
}

const convertDeepSeekHistoryToThreadItems = (
  history: DeepSeekMessage[],
): ThreadItem[] => {
  return history
    .filter((msg) => msg.role !== "system")
    .map((msg) => ({
      id: msg.id,
      type: "message",
      data: {
        id: msg.id,
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content,
        timestamp: msg.createdAt.getTime(),
      },
    }));
};

const findLastUserMessage = (history: DeepSeekMessage[]): string | null => {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user") {
      return history[i].content;
    }
  }
  return null;
};

const getAgentTypeName = (type: AgentType | string): string => {
  const names: Record<AgentType, string> = {
    booking: "zakazivanje",
    auth: "prijavu/registraciju",
    prices: "cenovnik",
    appointments: "pregled termina",
    testimonials: "utiske",
  };
  return names[type as AgentType] || type;
};

export function AgentBridge({ children, claudiaAskAI }: AgentBridgeProps) {
  const { user, ensureFreshAuth } = useAuthActions();
  const { askAI: fallbackAskAI } = useAIQuery(user);
  const askAI = claudiaAskAI ?? fallbackAskAI;
  // Re-entrancy guard separate from orchestrator's `isTransitioning` — we
  // also want to drop a duplicate "CALL_AGENT" arriving on the same tick.
  const isProcessingRef = useRef(false);
  const pendingSystemActionRef = useRef<SystemActionEvent | null>(null);
  const authRef = useRef({
    isAuthenticated: !!user,
    userName: user?.name || "Gost",
  });

  useEffect(() => {
    authRef.current = {
      isAuthenticated: !!user,
      userName: user?.name || "Gost",
    };
  }, [user]);

  useEffect(() => {
    const unsubscribe = chatEvents.subscribe("CALL_AGENT", async (event) => {
      if (!isAgentCallEvent(event) || isProcessingRef.current) return;

      isProcessingRef.current = true;

      try {
        const {
          agentType,
          userMessage,
          originalUserMessage,
          history,
          handoffPayload,
        } = event.payload;
        const requiresFreshAuth =
          agentType === "appointments" ||
          handoffPayload?.intent === "appointments" ||
          handoffPayload?.intent === "cancel_appointment" ||
          handoffPayload?.intent === "update_appointment" ||
          handoffPayload?.intent === "create_booking" ||
          handoffPayload?.intent === "resume_booking_after_login";
        let authSnapshot = authRef.current;

        if (requiresFreshAuth) {
          const freshUser = await ensureFreshAuth();
          authSnapshot = {
            isAuthenticated: !!freshUser,
            userName: freshUser?.name || "Gost",
          };
          authRef.current = authSnapshot;
        }

        // Smooth scroll to keep the new agent's first message in view.
        const mainContent = document.getElementById("main-content");
        if (mainContent) {
          mainContent.scrollTo({
            top: mainContent.scrollHeight,
            behavior: "smooth",
          });
        }

        const originalUserQuery =
          originalUserMessage ||
          (history ? findLastUserMessage(history) : null) ||
          userMessage;
        const convertedHistory = history
          ? convertDeepSeekHistoryToThreadItems(history)
          : [];
        console.debug("[AI_HANDOFF]", {
          originalUserMessage: originalUserQuery,
          mariaReply: userMessage,
          handoffPayload,
          authState: authSnapshot,
        });

        // Notify subscribers that the specialist has taken over — fires before
        // Claudia starts so any listener sees the correct chronological order.
        chatEvents.emit({
          type: "AGENT_RESPONSE",
          payload: {
            agentType,
            content: `Specijalizovani asistent za ${getAgentTypeName(agentType)} je preuzeo zahtev.`,
            completed: false,
          },
          timestamp: Date.now(),
        });

        // Route through the orchestrator. It owns the state transition; the
        // invokeClaudia callback is awaited inside, so Maria's reply has
        // already streamed into the thread by the time Claudia starts.
        await handleMariaResponse(
          {
            type: "handoff",
            message: "",
            targetAgent: agentType as MariaTargetAgent,
            payload: handoffPayload,
          },
          {
            userMessage: originalUserQuery,
            invokeClaudia: async (_input, payload) => {
              await askAI(originalUserQuery, {
                context: convertedHistory,
                preserveHistory: true,
                explicitAuth: authSnapshot,
                handoffPayload: payload,
              });
            },
          },
        );
      } catch (error) {
        console.error("[AgentBridge] handoff failed:", error);
      } finally {
        isProcessingRef.current = false;
        const queuedEvent = pendingSystemActionRef.current;
        pendingSystemActionRef.current = null;
        if (queuedEvent) queueMicrotask(() => chatEvents.emit(queuedEvent));
      }
    });

    return unsubscribe;
  }, [askAI, ensureFreshAuth]);

  useEffect(() => {
    const routeSystemAction = async (event: SystemActionEvent) => {
      if (shouldIgnoreSystemActionForRouting(event)) {
        logSystemActionEvent("[EVENT_IGNORED]", event, {
          reason: "stale_or_duplicate_booking_action",
        });
        return;
      }

      if (event.notifyAgent) {
        executeUICommand({
          type: "OPEN_DRAWER",
          reason: "system_action_notify_agent",
        });
      }

      const agentRequest = systemActionToAgentRequest(event);
      if (!event.notifyAgent || !agentRequest) {
        logSystemActionEvent("[EVENT_IGNORED]", event, {
          reason: !event.notifyAgent ? "notifyAgent_false" : "no_agent_mapping",
        });
        return;
      }

      logSystemActionEvent("[EVENT_ROUTED]", event, {
        targetAgent: agentRequest.agentType,
        intent: agentRequest.handoffPayload.intent,
      });

      const requiresFreshAuth =
        agentRequest.handoffPayload.intent === "appointments" ||
        agentRequest.handoffPayload.intent === "cancel_appointment" ||
        agentRequest.handoffPayload.intent === "update_appointment" ||
        agentRequest.handoffPayload.intent === "create_booking" ||
        agentRequest.handoffPayload.intent === "resume_booking_after_login";
      let authSnapshot = authRef.current;

      if (requiresFreshAuth) {
        const freshUser = await ensureFreshAuth();
        authSnapshot = {
          isAuthenticated: !!freshUser,
          userName: freshUser?.name || "Gost",
        };
        authRef.current = authSnapshot;
      }

      await handleMariaResponse(
        {
          type: "handoff",
          message: "",
          targetAgent: agentRequest.agentType as MariaTargetAgent,
          payload: agentRequest.handoffPayload,
        },
        {
          userMessage: agentRequest.input,
          invokeClaudia: async (_input, payload) => {
            await askAI(agentRequest.input, {
              context: [],
              preserveHistory: true,
              explicitAuth: authSnapshot,
              handoffPayload: payload,
              suppressUserMessage: true,
            });
          },
        },
      );
    };

    const unsubscribe = chatEvents.subscribe("system_action", async (event) => {
      if (!isSystemActionEvent(event)) return;

      if (isProcessingRef.current) {
        pendingSystemActionRef.current = event;
        logSystemActionEvent("[EVENT_IGNORED]", event, {
          reason: "queued_while_agent_transitioning",
        });
        return;
      }

      isProcessingRef.current = true;

      try {
        let nextEvent: typeof event | null = event;
        while (nextEvent) {
          pendingSystemActionRef.current = null;
          await routeSystemAction(nextEvent);
          nextEvent = pendingSystemActionRef.current;
        }
      } catch (error) {
        console.error("[AgentBridge] system action failed:", error);
      } finally {
        isProcessingRef.current = false;
      }
    });

    return unsubscribe;
  }, [askAI, ensureFreshAuth]);

  return <>{children}</>;
}

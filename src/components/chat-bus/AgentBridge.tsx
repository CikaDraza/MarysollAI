// components/chat-bus/AgentBridge.tsx
"use client";

import { ReactNode, useEffect, useRef } from "react";
import { chatEvents, isAgentCallEvent } from "@/lib/ai/events/chatEvents";
import { useAIQuery } from "@/hooks/useAIQuery";
import { useAuthActions } from "@/hooks/useAuthActions";
import { ThreadItem } from "@/types/ai/chat-thread";
import { Message as DeepSeekMessage } from "@/types/ai/deepseek";
import { AgentType } from "@/types/ai/deepseek/agent-call";
import { useDrawerSeek } from "@/hooks/useDrawerSeek";

interface AgentBridgeProps {
  children: ReactNode;
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

export function AgentBridge({ children }: AgentBridgeProps) {
  const { user } = useAuthActions();
  const { askAI } = useAIQuery(user);
  const { closeDrawer } = useDrawerSeek();
  const isProcessingRef = useRef(false);
  // ✅ Ref za trenutne auth podatke
  const authRef = useRef({
    isAuthenticated: !!user,
    userName: user?.name || "Gost",
  });

  // ✅ Odmah ažuriraj auth ref
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
        const { agentType, userMessage, history } = event.payload;

        const mainContent = document.getElementById("main-content");
        if (mainContent) {
          mainContent.scrollTo({
            top: mainContent.scrollHeight,
            behavior: "smooth",
          });
        }

        const originalUserQuery = history
          ? findLastUserMessage(history)
          : userMessage;
        const convertedHistory = history
          ? convertDeepSeekHistoryToThreadItems(history)
          : [];

        // ✅ Prosledi eksplicitne auth podatke
        await askAI(originalUserQuery || userMessage, {
          context: convertedHistory,
          preserveHistory: true,
          explicitAuth: authRef.current, // ✅ Ključno: trenutni auth podaci
        });

        chatEvents.emit({
          type: "AGENT_RESPONSE",
          payload: {
            agentType,
            content: `Prebacujem te na specijalizovanog asistenta za ${getAgentTypeName(agentType)}. Pogledaj dole na dnu stranice.`,
            completed: false,
          },
          timestamp: Date.now(),
        });
        closeDrawer();
      } catch (error) {
        console.error("Agent bridge error:", error);
      } finally {
        isProcessingRef.current = false;
      }
    });

    return unsubscribe;
  }, [askAI, closeDrawer]);

  return <>{children}</>;
}

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

// Konvertor iz DeepSeek Message u ThreadItem (samo user/assistant poruke, bez system)
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

// Pronađi poslednju KORISNIČKU poruku iz istorije
const findLastUserMessage = (history: DeepSeekMessage[]): string | null => {
  // Idi unazad kroz istoriju i nađi prvu user poruku (to je ono što je korisnik pitao)
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

  useEffect(() => {
    const unsubscribe = chatEvents.subscribe("CALL_AGENT", async (event) => {
      if (!isAgentCallEvent(event) || isProcessingRef.current) return;

      isProcessingRef.current = true;

      try {
        const { agentType, userMessage, history } = event.payload;

        // 1. Skroluj glavni kontejner na dno pre nego što Gemini krene
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

        // 2. Pokreni Gemini
        await askAI(originalUserQuery || userMessage, {
          context: convertedHistory,
          preserveHistory: true,
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
  }, [askAI, user, closeDrawer]);

  return <>{children}</>;
}

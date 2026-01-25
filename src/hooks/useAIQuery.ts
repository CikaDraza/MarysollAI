"use client";

import { useState } from "react";
import { AuthUser } from "@/types/auth-types";
import { createThreadItems } from "@/lib/ai/createThreadItems";
import { useChatHistory } from "./useChatHistory";

export function useAIQuery(user?: AuthUser | null) {
  const { thread, saveToHistory, setThread, clearHistory } = useChatHistory();
  const [isTextLoading, setIsTextLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const askAI = async (query: string) => {
    try {
      setError(null);
      setIsTextLoading(true);
      // 2. Jedan poziv za SVE (Tekst + Layout)
      const response = await fetch("/api/ai/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: query,
          isAuthenticated: !!user,
          userName: user?.name,
          history: thread, // Šaljemo istoriju
        }),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullRawResponse = "";

      // Čitamo stream dok ne završi
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullRawResponse += chunk;

        // Ovde ćemo kasnije dodati Live-Update za tekst
        // Za sada čekamo kraj da bismo obradili JSON
      }

      // Kada se stream završi, parsiramo finalni JSON
      const aiResponse = JSON.parse(fullRawResponse);
      const newElements = createThreadItems(query, aiResponse);

      const updatedThread = [...thread, ...newElements];
      setThread(updatedThread);
      saveToHistory(updatedThread);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Greška";
      setError(errorMessage);
    } finally {
      setIsTextLoading(false);
    }
  };

  return {
    askAI,
    thread,
    isTextLoading,
    error,
    resetError: () => setError(null),
    clearChat: clearHistory,
  };
}

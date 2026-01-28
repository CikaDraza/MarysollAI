"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AuthUser } from "@/types/auth-types";
import { createThreadItems } from "@/lib/ai/createThreadItems";
import { useChatHistory } from "./useChatHistory";
import partialParse from "partial-json-parser";
import { TextMessage } from "@/types/ai/ai.text-engine";
import { BaseBlock } from "@/types/landing-block";

interface PartialAIResponse {
  messages?: Pick<TextMessage, "content">[];
  layout?: unknown[];
}

interface AIResponseData {
  messages: TextMessage[];
  layout: BaseBlock[];
}

interface PendingResponse {
  query: string;
  data: AIResponseData;
}

export function useAIQuery(user?: AuthUser | null) {
  const { thread, saveToHistory, setThread, clearHistory } = useChatHistory();
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isTextLoading, setIsTextLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targetTextRef = useRef("");
  const isNetworkDoneRef = useRef(false);
  const activeTempIdRef = useRef<string | null>(null);

  const [pendingResponse, setPendingResponse] =
    useState<PendingResponse | null>(null);

  // Funkcija za završetak, umotana u useCallback da bismo mogli da je koristimo u useEffect
  const finishQuery = useCallback(() => {
    if (!pendingResponse) return;

    const newElements = createThreadItems(
      pendingResponse.query,
      pendingResponse.data,
    );

    setThread((prev) => {
      // Filtriramo koristeći ID iz REF-a
      const filtered = prev.filter((i) => i.id !== activeTempIdRef.current);
      const updated = [...filtered, ...newElements];
      saveToHistory(updated);
      return updated;
    });

    setIsStreaming(false);
    setIsTextLoading(false);
    setPendingResponse(null);
    setStreamingText("");
    activeTempIdRef.current = null; // Resetujemo ID nakon završetka
  }, [pendingResponse, saveToHistory, setThread]);

  // Typewriter efekat: Svakih 30ms dodajemo po jedan karakter
  useEffect(() => {
    if (!isStreaming) return;

    const timer = setInterval(() => {
      setStreamingText((prev) => {
        const target = targetTextRef.current;

        if (prev.length >= target.length && isNetworkDoneRef.current) {
          clearInterval(timer);
          // DODAJEMO DRAMSKU PAUZU
          setTimeout(() => {
            finishQuery();
          }, 600); // Malo smo povećali pauzu za bolji UX

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

  const askAI = async (query: string) => {
    if (isStreaming) return;

    // Generišemo ID i odmah ga čuvamo u REF
    const currentId = `temp-${crypto.randomUUID()}`;
    activeTempIdRef.current = currentId;

    setIsStreaming(true);
    setIsTextLoading(true);
    isNetworkDoneRef.current = false;
    setIsTextLoading(true);
    setStreamingText("");
    targetTextRef.current = "";
    setError(null);

    // 1. Odmah dodajemo User poruku u thread da je korisnik vidi
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
      let fullRaw = "";

      // Čitamo stream dok ne završi
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullRaw += chunk;

        // 3. PARCIJALNO PARSIRANJE
        try {
          const partialData = partialParse(fullRaw) as PartialAIResponse;
          targetTextRef.current =
            partialData?.messages?.map((m) => m.content).join("\n\n") || "";
        } catch (err: unknown) {
          const errorMessage =
            err instanceof Error ? err.message : "Greška u parsiranju";
          setError(errorMessage);
          setIsStreaming(false);
          setIsTextLoading(false);
          isNetworkDoneRef.current = false;
          console.error(errorMessage);
          setThread((prev) =>
            prev.filter((i) => i.id !== activeTempIdRef.current),
          );
        }
      }

      // 3. Kada se stream završi, parsiramo finalni JSON
      const finalData = JSON.parse(fullRaw) as AIResponseData;
      if (finalData && Array.isArray(finalData.messages)) {
        setPendingResponse({ query, data: finalData });
        isNetworkDoneRef.current = true;
      } else {
        throw new Error("Invalid AI Response Format");
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Greška";
      setError(errorMessage);
      setIsStreaming(false);
      setIsTextLoading(false);
      isNetworkDoneRef.current = false;
      setThread((prev) => prev.filter((i) => i.id !== activeTempIdRef.current));
    }
  };

  return {
    askAI,
    thread,
    streamingText,
    isStreaming,
    isTextLoading,
    error,
    resetError: () => setError(null),
    clearChat: clearHistory,
  };
}

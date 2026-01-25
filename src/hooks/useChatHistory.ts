// src/hooks/useChatHistory.ts
import { useState, useCallback } from "react";
import { ThreadItem } from "@/types/ai/chat-thread";

const STORAGE_KEY = process.env.NEXT_PUBLIC_STORAGE_KEY || "marysoll_chat_v1";
const MAX_ITEMS = Number(process.env.NEXT_PUBLIC_MAX_ITEMS) || 20;

export function useChatHistory() {
  // Koristimo "Lazy Initialization" - funkcija koja se izvršava samo JEDNOM pri mount-u
  const [thread, setThread] = useState<ThreadItem[]>(() => {
    // Provera da li smo na klijentu (zbog SSR-a u Next.js)
    if (typeof window === "undefined") return [];

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Greška pri parsiranju istorije:", e);
        localStorage.removeItem(STORAGE_KEY);
        return [];
      }
    }
    return [];
  });

  // 2. Funkcija za čuvanje (sa limitom)
  const saveToHistory = useCallback((newItems: ThreadItem[]) => {
    // Zadržavamo samo poslednjih MAX_ITEMS da ne bi usporili aplikaciju
    const limitedThread = newItems.slice(-MAX_ITEMS);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(limitedThread));
    }
  }, []);

  // 3. Brisanje istorije (npr. Logout ili nova sesija)
  const clearHistory = useCallback(() => {
    setThread([]);
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  return {
    thread,
    setThread,
    saveToHistory,
    clearHistory,
  };
}

// src/hooks/useChatHistory.ts
import { useState, useCallback } from "react";
import { ThreadItem } from "@/types/ai/chat-thread";
import { useParams } from "next/navigation";

const STORAGE_KEY = process.env.NEXT_PUBLIC_STORAGE_KEY || "marysoll_chat_v2";
const MAX_ITEMS = Number(process.env.NEXT_PUBLIC_MAX_ITEMS) || 10;

export function useChatHistory() {
  const params = useParams();
  // Kreiramo unikatan ključ na osnovu putanje (npr. "chat-history-/newsletter/docek-kafana")
  const pathKey = Array.isArray(params.slug)
    ? params.slug.join("/")
    : params.slug || "home";
  const storageKey = `${STORAGE_KEY}-${pathKey}`;

  // Koristimo "Lazy Initialization" - funkcija koja se izvršava samo JEDNOM pri mount-u
  const [thread, setThread] = useState<ThreadItem[]>(() => {
    // Provera da li smo na klijentu (zbog SSR-a u Next.js)
    if (typeof window === "undefined") return [];

    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Greška pri parsiranju istorije:", e);
        localStorage.removeItem(storageKey);
        return [];
      }
    }
    return [];
  });

  // 2. Funkcija za čuvanje (sa limitom)
  const saveToHistory = useCallback(
    (newItems: ThreadItem[]) => {
      // Zadržavamo samo poslednjih MAX_ITEMS da ne bi usporili aplikaciju
      const limitedThread = newItems.slice(-MAX_ITEMS);
      if (typeof window !== "undefined") {
        localStorage.setItem(storageKey, JSON.stringify(limitedThread));
      }
    },
    [storageKey],
  );

  // 3. Brisanje istorije (npr. Logout ili nova sesija)
  const clearHistory = useCallback(() => {
    setThread([]);
    if (typeof window !== "undefined") {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  return {
    thread,
    setThread,
    saveToHistory,
    clearHistory,
  };
}

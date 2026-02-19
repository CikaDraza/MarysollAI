// src/hooks/useChatHistory.ts
import { useCallback, useSyncExternalStore } from "react";
import { ThreadItem } from "@/types/ai/chat-thread";
import { useParams } from "next/navigation";

const STORAGE_KEY = process.env.NEXT_PUBLIC_STORAGE_KEY || "marysoll_chat_v2";
const MAX_ITEMS = Number(process.env.NEXT_PUBLIC_MAX_ITEMS) || 10;

const getInitialThread = (): ThreadItem[] => {
  if (typeof window === "undefined") return [];

  // Ne možemo koristiti useParams ovde, pa ćemo koristiti window.location
  // Ovo nije idealno, ali radi za inicijalizaciju
  const path = window.location.pathname;
  const pathKey = path === "/" ? "home" : path.slice(1).replace(/\//g, "-");
  const storageKey = `${STORAGE_KEY}-${pathKey}`;

  const saved = localStorage.getItem(storageKey);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      console.log(`📚 Loaded chat history for ${pathKey}:`, parsed.length);
      return parsed;
    } catch (e) {
      console.error("Greška pri parsiranju istorije:", e);
      localStorage.removeItem(storageKey);
    }
  }
  return [];
};

let thread = getInitialThread();
const listeners = new Set<() => void>();

const threadStore = {
  getThread: () => thread,
  setThread: (
    newThread: ThreadItem[] | ((prev: ThreadItem[]) => ThreadItem[]),
  ) => {
    thread = typeof newThread === "function" ? newThread(thread) : newThread;
    listeners.forEach((listener) => listener());
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useChatHistory() {
  const params = useParams();
  // Kreiramo unikatan ključ na osnovu putanje (npr. "chat-history-/newsletter/docek-kafana")
  const pathKey = Array.isArray(params.slug)
    ? params.slug.join("/")
    : params.slug || "home";
  const storageKey = `${STORAGE_KEY}-${pathKey}`;

  const thread = useSyncExternalStore(
    threadStore.subscribe,
    threadStore.getThread,
    threadStore.getThread,
  );

  const setThread = useCallback(
    (newThread: ThreadItem[] | ((prev: ThreadItem[]) => ThreadItem[])) => {
      threadStore.setThread(newThread);
    },
    [],
  );

  // 2. Funkcija za čuvanje (sa limitom)
  const saveToHistory = useCallback(
    (newItems: ThreadItem[]) => {
      // Zadržavamo samo poslednjih MAX_ITEMS da ne bi usporili aplikaciju
      const limitedThread = newItems.slice(-MAX_ITEMS);
      if (typeof window !== "undefined") {
        localStorage.setItem(storageKey, JSON.stringify(limitedThread));
      }
      setThread(limitedThread);
    },
    [storageKey, setThread],
  );

  // Dodajemo wrapper za setThread koji automatski limitira
  const updateThread = useCallback(
    (updater: (prev: ThreadItem[]) => ThreadItem[]) => {
      setThread((prev) => {
        const updated = updater(prev);
        const limited = updated.slice(-MAX_ITEMS);

        if (typeof window !== "undefined") {
          localStorage.setItem(storageKey, JSON.stringify(limited));
        }
        return limited;
      });
    },
    [storageKey, setThread],
  );

  // 3. Brisanje istorije (npr. Logout ili nova sesija)
  const clearHistory = useCallback(() => {
    setThread([]);
    if (typeof window !== "undefined") {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey, setThread]);

  return {
    thread,
    setThread,
    saveToHistory,
    updateThread,
    clearHistory,
  };
}

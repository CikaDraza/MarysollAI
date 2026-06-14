// src/hooks/useConversationHistory.ts
//
// Persists past chat conversations so starting a NEW conversation saves the
// previous one instead of wiping it. localStorage-backed; the live thread is a
// computed merge (Maria + Claudia) with no single setter, so a restored session
// is shown as a read-only archived view in the drawer.

import { useCallback, useState } from "react";
import type { ThreadItem } from "@/types/ai/chat-thread";

export interface SavedConversation {
  id: string;
  title: string;
  createdAt: number;
  thread: ThreadItem[];
}

const KEY = "marysoll_chat_history";
const MAX = 20;

function read(): SavedConversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as SavedConversation[]) : [];
  } catch {
    return [];
  }
}

function write(list: SavedConversation[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* private mode / quota — ignore */
  }
}

function titleFrom(thread: ThreadItem[]): string {
  const firstUser = thread.find(
    (i): i is Extract<ThreadItem, { type: "message" }> =>
      i.type === "message" && i.data.role === "user",
  );
  const raw = (firstUser?.data.content ?? "Razgovor").replace(/\s+/g, " ").trim();
  return raw.length > 40 ? `${raw.slice(0, 39)}…` : raw || "Razgovor";
}

export function useConversationHistory() {
  const [sessions, setSessions] = useState<SavedConversation[]>(read);

  /** Snapshot a thread into history. No-op for empty threads. */
  const save = useCallback((thread: ThreadItem[] | null | undefined) => {
    if (!thread || thread.length === 0) return;
    const session: SavedConversation = {
      id: `conv-${Date.now()}`,
      title: titleFrom(thread),
      createdAt: Date.now(),
      thread,
    };
    setSessions((prev) => {
      const next = [session, ...prev].slice(0, MAX);
      write(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      write(next);
      return next;
    });
  }, []);

  const getThread = useCallback(
    (id: string): ThreadItem[] | null =>
      read().find((s) => s.id === id)?.thread ?? null,
    [],
  );

  return { sessions, save, remove, getThread };
}

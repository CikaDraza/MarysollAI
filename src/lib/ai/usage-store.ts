// src/lib/ai/usage-store.ts
//
// Model Lab — globalni store poslednje AI usage telemetrije. Obe send putanje
// (Maria/useChatSeek i Claudia/useAIQuery) upisuju ovde po odgovoru; UsageStats
// čita. Isti useSyncExternalStore obrazac kao setGlobalStreaming u useChatHistory.

import { useSyncExternalStore } from "react";

export interface AiUsageSnapshot {
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number | null;
  latencyMs?: number;
  /** Da li su tokeni procenjeni (provajder nije vratio usage). */
  estimated?: boolean;
}

let lastUsage: AiUsageSnapshot | null = null;
const listeners = new Set<() => void>();

export function setLastAiUsage(usage: AiUsageSnapshot | null): void {
  lastUsage = usage;
  listeners.forEach((l) => l());
}

const usageStore = {
  getSnapshot: () => lastUsage,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useLastAiUsage(): AiUsageSnapshot | null {
  return useSyncExternalStore(
    usageStore.subscribe,
    usageStore.getSnapshot,
    () => null,
  );
}

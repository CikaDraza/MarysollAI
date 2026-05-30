import { useSyncExternalStore } from "react";

export type BlockLifecycleState = "active" | "consumed" | "stale" | "disabled";

export interface BlockLifecycleRecord {
  blockId: string;
  blockType: string;
  state: BlockLifecycleState;
  consumedByActionId?: string;
  consumedAt?: number;
  reason?: string;
}

const records = new Map<string, BlockLifecycleRecord>();
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): string {
  return JSON.stringify([...records.values()]);
}

export function markBlockConsumed(
  blockId: string,
  reason: string,
  actionId?: string,
  blockType = "unknown",
): BlockLifecycleRecord {
  const record: BlockLifecycleRecord = {
    blockId,
    blockType,
    state: "consumed",
    consumedByActionId: actionId,
    consumedAt: Date.now(),
    reason,
  };
  records.set(blockId, record);
  emit();
  return record;
}

export function isBlockConsumed(blockId?: string): boolean {
  if (!blockId) return false;
  return records.get(blockId)?.state === "consumed";
}

export function getBlockLifecycle(
  blockId?: string,
): BlockLifecycleRecord | undefined {
  if (!blockId) return undefined;
  return records.get(blockId);
}

export function resetBlockLifecycle(): void {
  records.clear();
  emit();
}

export function useBlockLifecycle(
  blockId?: string,
): BlockLifecycleRecord | undefined {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  return getBlockLifecycle(blockId);
}

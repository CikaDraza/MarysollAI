"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import type { BaseBlock } from "@/types/landing-block";
import { useAIContext } from "./AIContext";
import { useBookingModal } from "./BookingModalContext";
import { uiCommandBus } from "@/lib/ai/ui/ui-command-executor";

interface WorkspaceContextValue {
  activeBlock: BaseBlock | null;
  dismissWorkspace: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { unifiedThread } = useAIContext();
  const { modalSlot } = useBookingModal();
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [commandBlock, setCommandBlock] = useState<BaseBlock | null>(null);

  const lastBlock = useMemo<BaseBlock | null>(() => {
    for (let i = unifiedThread.length - 1; i >= 0; i--) {
      const item = unifiedThread[i];
      if (item.type === "block") return item.data;
    }
    return null;
  }, [unifiedThread]);

  // Auto-dismiss when booking modal opens (user picked a slot)
  const prevModalSlot = useRef(modalSlot);
  useEffect(() => {
    if (modalSlot && !prevModalSlot.current && lastBlock) {
      setDismissedId(lastBlock.id);
      setCommandBlock(null);
    }
    prevModalSlot.current = modalSlot;
  }, [modalSlot, lastBlock]);

  useEffect(() => {
    return uiCommandBus.subscribe((command) => {
      if (command.type === "RENDER_BLOCK" && (command.surface ?? "workspace") === "workspace") {
        setDismissedId(null);
        setCommandBlock({
          ...command.block,
          id: command.block.id ?? `ui-${command.block.type}-${Date.now()}`,
        });
        return;
      }
      if (command.type === "CLEAR_WORKSPACE") {
        setCommandBlock(null);
        setDismissedId(lastBlock?.id ?? null);
      }
    });
  }, [lastBlock?.id]);

  const activeBlock =
    commandBlock ?? (lastBlock && lastBlock.id !== dismissedId ? lastBlock : null);

  const dismissWorkspace = () => {
    if (commandBlock) {
      setCommandBlock(null);
      return;
    }
    if (lastBlock) setDismissedId(lastBlock.id);
  };

  return (
    <WorkspaceContext.Provider value={{ activeBlock, dismissWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}

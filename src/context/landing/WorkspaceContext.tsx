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

interface WorkspaceContextValue {
  activeBlock: BaseBlock | null;
  dismissWorkspace: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { unifiedThread } = useAIContext();
  const { modalSlot } = useBookingModal();
  const [dismissedId, setDismissedId] = useState<string | null>(null);

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
    }
    prevModalSlot.current = modalSlot;
  }, [modalSlot, lastBlock]);

  const activeBlock =
    lastBlock && lastBlock.id !== dismissedId ? lastBlock : null;

  const dismissWorkspace = () => {
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

// src/store/ai/agent-state.ts
//
// Phase 1 — Centralized active agent state.
// Replaces the per-context useState in AIContext. Session-only (no persistence).
//
// Why a store and not context: the orchestrator (lib/ai/orchestrator) and the
// event bus listeners need to read/write this from outside React. A store with
// vanilla `getState()/setState()` lets non-React code participate.
import { create } from "zustand";

export type ActiveAgent = "maria" | "claudia" | "auth" | "idle";

export type ClaudiaSubAgent =
  | "booking"
  | "auth"
  | "prices"
  | "appointments"
  | "testimonials";

interface AgentStateValue {
  /** Currently active top-level agent. */
  activeAgent: ActiveAgent;
  /** When activeAgent is "claudia", which sub-agent persona is in flight. */
  claudiaSubAgent: ClaudiaSubAgent | null;
  /** Agent that was active before a transient handoff (e.g. auth interrupt). */
  previousAgent: ActiveAgent;
  /** True while a handoff is in progress; blocks duplicate transitions. */
  isTransitioning: boolean;
}

interface AgentStateActions {
  setActiveAgent: (agent: ActiveAgent, sub?: ClaudiaSubAgent | null) => void;
  setTransitioning: (value: boolean) => void;
  /** Restore the previous agent (e.g. after auth interrupt completes). */
  restorePreviousAgent: () => void;
  /** Hard reset back to Maria. Called on chat clear / new session. */
  reset: () => void;
}

const initialState: AgentStateValue = {
  activeAgent: "maria",
  claudiaSubAgent: null,
  previousAgent: "maria",
  isTransitioning: false,
};

export const useAgentState = create<AgentStateValue & AgentStateActions>(
  (set, get) => ({
    ...initialState,

    setActiveAgent: (agent, sub = null) => {
      const prev = get().activeAgent;
      // No-op when nothing changes — avoids unnecessary subscriber notifications.
      if (prev === agent && get().claudiaSubAgent === sub) return;
      set({
        activeAgent: agent,
        claudiaSubAgent: agent === "claudia" ? sub : null,
        previousAgent: prev,
      });
    },

    setTransitioning: (value) => set({ isTransitioning: value }),

    restorePreviousAgent: () => {
      const prev = get().previousAgent;
      set({
        activeAgent: prev,
        claudiaSubAgent: null,
        previousAgent: prev,
      });
    },

    reset: () => set({ ...initialState }),
  }),
);

// Vanilla helpers for non-React code (orchestrator, event bus listeners).
export const agentState = {
  get: () => useAgentState.getState(),
  set: useAgentState.setState,
  subscribe: useAgentState.subscribe,
};

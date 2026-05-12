// src/lib/ai/orchestrator/ai-orchestrator.ts
//
// Phase 1 — Deterministic AI orchestrator.
//
// Replaces the implicit dual-listener race condition where AIContext and
// AgentBridge both subscribed to "CALL_AGENT" and acted in parallel. This
// orchestrator is the single owner of agent transitions:
//
//   1. Maria's response is parsed (Zod-validated)
//   2. If type === "answer": stay on Maria, no further action
//   3. If type === "handoff": flip activeAgent, then trigger Claudia
//      sequentially (caller awaits the returned promise)
//
// Concurrency guard: `isTransitioning` prevents two handoffs racing if Maria
// somehow emits twice (network retry, Strict Mode double-fire, etc.).

import {
  MariaResponse,
  MariaTargetAgent,
} from "@/lib/ai/schemas/maria.schema";
import {
  agentState,
  type ActiveAgent,
  type ClaudiaSubAgent,
} from "@/store/ai/agent-state";
import { bookingFlow } from "@/lib/ai/booking-flow-state";
import { aiLog } from "@/lib/ai/debug-log";

const log = aiLog("AI_ORCHESTRATOR");
const transitionLog = aiLog("AGENT_TRANSITION");

export interface OrchestratorContext {
  /** Original message the user typed before Maria saw it. */
  userMessage: string;
  /** Function that triggers Claudia. Returns when she's done. */
  invokeClaudia: (input: string, payload?: Record<string, string>) => Promise<void>;
}

export interface OrchestrationResult {
  /** "answer" → Maria handled it; "handoff" → Claudia was invoked. */
  outcome: "answer" | "handoff" | "skipped";
  targetAgent: MariaTargetAgent;
  reason?: string;
}

/** Maps Maria's `targetAgent` to the Claudia sub-agent label used in state. */
function mapSubAgent(target: MariaTargetAgent): ClaudiaSubAgent | null {
  if (target === "none") return null;
  return target;
}

/** Maps Maria's `targetAgent` to a top-level ActiveAgent. */
function mapActiveAgent(target: MariaTargetAgent): ActiveAgent {
  if (target === "none") return "maria";
  if (target === "auth") return "auth";
  return "claudia";
}

/**
 * Single entry point for handling Maria's response. Sequences the transition,
 * updates state once, and triggers Claudia only after Maria's stream is done
 * (the caller is responsible for awaiting Maria first).
 */
export async function handleMariaResponse(
  response: MariaResponse,
  ctx: OrchestratorContext,
): Promise<OrchestrationResult> {
  if (response.type === "answer") {
    // FAQ / direct answer — no transition needed.
    log("answer", { targetAgent: response.targetAgent });
    return { outcome: "answer", targetAgent: response.targetAgent };
  }

  // Handoff path. Guard against duplicate transitions firing in parallel.
  const state = agentState.get();
  if (state.isTransitioning) {
    log("handoff.skipped_in_progress", { targetAgent: response.targetAgent });
    return {
      outcome: "skipped",
      targetAgent: response.targetAgent,
      reason: "transition_in_progress",
    };
  }

  agentState.get().setTransitioning(true);
  try {
    const targetActive = mapActiveAgent(response.targetAgent);
    const targetSub = mapSubAgent(response.targetAgent);

    // Persist any structured intent Maria extracted so Claudia doesn't re-ask.
    if (response.payload) {
      const { service, city, date, time } = response.payload;
      bookingFlow.get().collect({ service, city, date, time });
      if (response.payload.intent) {
        bookingFlow.get().setLastIntent(response.payload.intent);
      }
      log("payload.collected", { ...response.payload });
    }

    transitionLog("from->to", {
      from: state.activeAgent,
      to: targetActive,
      sub: targetSub,
    });
    agentState.get().setActiveAgent(targetActive, targetSub);

    // Build Claudia's input. We forward the original user message so Claudia
    // sees the same intent Maria saw, plus any payload context Maria pre-extracted.
    await ctx.invokeClaudia(ctx.userMessage, response.payload);

    log("handoff.complete", { targetAgent: response.targetAgent });
    return { outcome: "handoff", targetAgent: response.targetAgent };
  } finally {
    agentState.get().setTransitioning(false);
  }
}

/**
 * Called when a sub-flow (booking, auth) completes. Resets to Maria for
 * follow-up conversation.
 */
export function handleAgentTransition(toAgent: ActiveAgent): void {
  agentState.get().setActiveAgent(toAgent);
  if (toAgent === "maria") {
    // Booking is done — clear flow state so the next session starts fresh.
    bookingFlow.get().reset();
  }
}

/** Hard reset — used by /clear chat. */
export function resetAgentState(): void {
  agentState.get().reset();
  bookingFlow.get().reset();
}

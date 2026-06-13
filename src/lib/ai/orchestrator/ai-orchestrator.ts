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
  MariaResponseSchema,
  MariaTargetAgent,
} from "@/lib/ai/schemas/maria.schema";
import {
  agentState,
  type ActiveAgent,
  type ClaudiaSubAgent,
} from "@/store/ai/agent-state";
import { bookingFlow } from "@/lib/ai/booking-flow-state";
import { aiLog } from "@/lib/ai/debug-log";
import { chatEvents } from "@/lib/ai/events/chatEvents";
import {
  getLastClaudiaActivityAt,
  resetClaudiaActivity,
} from "@/lib/ai/claudia-activity";

const log = aiLog("AI_ORCHESTRATOR");
const transitionLog = aiLog("AGENT_TRANSITION");

/** Upper bound on a Claudia handoff. If she doesn't respond inside this
 * window the orchestrator releases the transition flag, emits a fallback
 * message to the chat surface, and lets the user retry. Mirrors the
 * AI_TIMEOUT_MS used by the DeepSeek route on the Maria side. */
const CLAUDIA_HANDOFF_TIMEOUT_MS = 18_000;

const CLAUDIA_TIMEOUT_FALLBACK_MESSAGE =
  "Molimo vas sačekajte, proveravamo — odgovor stiže za koji trenutak.";

const CLAUDIA_BACKGROUND_FAILURE_MESSAGE =
  "Nažalost, provera nije uspela. Pokušajte ponovo — vaši podaci su sačuvani.";

const CLAUDIA_PARSE_FALLBACK_MESSAGE =
  "Došlo je do kratkog zastoja u komunikaciji. Pokušajte ponovo, molim vas.";

export interface OrchestratorContext {
  /** Original message the user typed before Maria saw it. */
  userMessage: string;
  /** Function that triggers Claudia. Returns when she's done. */
  invokeClaudia: (input: string, payload?: Record<string, unknown>) => Promise<void>;
}

export interface OrchestrationResult {
  /** "answer" → Maria handled it; "handoff" → Claudia was invoked.
   * "skipped" covers both "transition already running" and "input failed
   * schema validation". "timeout" means Claudia did not finish in time. */
  outcome: "answer" | "handoff" | "skipped" | "timeout";
  targetAgent: MariaTargetAgent;
  reason?: string;
}

/** Faza 7 — timeout svestan aktivnosti. Umesto tvrdog "završi za `idleMs`",
 * okida fallback tek kada NEMA aktivnosti `idleMs`. Svaki stream okvir od
 * Claudie (status/final) zove markClaudiaActivity() i tako gura rok unapred —
 * pa proaktivni "proveravamo…" status spreči lažni "stuck" fallback dok
 * Claudia očigledno radi. Odbijanja `task`-a propagiraju (kao i ranije). */
function withActivityTimeout<T>(
  task: Promise<T>,
  idleMs: number,
): Promise<{ timedOut: boolean }> {
  resetClaudiaActivity();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const idleRace = new Promise<{ timedOut: boolean }>((resolve) => {
    const tick = () => {
      const idle = Date.now() - getLastClaudiaActivityAt();
      if (idle >= idleMs) {
        resolve({ timedOut: true });
        return;
      }
      // Re-check exactly when the budget could next expire.
      timer = setTimeout(tick, Math.max(250, idleMs - idle));
    };
    timer = setTimeout(tick, idleMs);
  });
  const work = task.then<{ timedOut: boolean }>(() => ({ timedOut: false }));
  return Promise.race([work, idleRace]).finally(() => {
    if (timer) clearTimeout(timer);
  });
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
  // Runtime Zod guard. The static type already says response is a
  // MariaResponse, but a buggy caller (server route, test, retry path)
  // could still hand us something that doesn't match the contract. We
  // refuse to flip agent state on malformed input — emit a chat-visible
  // error and stay on Maria.
  const validated = MariaResponseSchema.safeParse(response);
  if (!validated.success) {
    log("response.schema_invalid", {
      issues: validated.error.issues.map((i) => i.message),
    });
    chatEvents.emit({
      type: "AGENT_RESPONSE",
      payload: {
        // AgentResponseEvent.agentType doesn't include "maria"; fall back
        // to "booking" because that's the most common sub-agent path Maria
        // would have routed into.
        agentType: "booking",
        content: CLAUDIA_PARSE_FALLBACK_MESSAGE,
        completed: true,
      },
      timestamp: Date.now(),
    });
    return {
      outcome: "skipped",
      targetAgent: "none",
      reason: "schema_invalid",
    };
  }
  const safeResponse = validated.data;

  if (safeResponse.type === "answer") {
    // FAQ / direct answer — no transition needed.
    log("answer", { targetAgent: safeResponse.targetAgent });
    return { outcome: "answer", targetAgent: safeResponse.targetAgent };
  }

  // Handoff path. Guard against duplicate transitions firing in parallel.
  const state = agentState.get();
  if (state.isTransitioning) {
    log("handoff.skipped_in_progress", { targetAgent: safeResponse.targetAgent });
    return {
      outcome: "skipped",
      targetAgent: safeResponse.targetAgent,
      reason: "transition_in_progress",
    };
  }

  agentState.get().setTransitioning(true);
  try {
    const targetActive = mapActiveAgent(safeResponse.targetAgent);
    const targetSub = mapSubAgent(safeResponse.targetAgent);

    // Persist any structured intent Maria extracted so Claudia doesn't re-ask.
    if (safeResponse.payload) {
      const {
        category,
        subcategory,
        service,
        serviceId,
        serviceName,
        city,
        date,
        time,
        timeWindowStart,
        timeWindowEnd,
        salonId,
        salonName,
      } = safeResponse.payload;
      const beforeCollected = { ...bookingFlow.get().collected };
      if (safeResponse.payload.intent === "booking") {
        bookingFlow.get().bumpFlowVersion("new_booking_intent");
      }
      bookingFlow.get().collect({
        category: typeof category === "string" ? category : undefined,
        subcategory: typeof subcategory === "string" ? subcategory : undefined,
        service: typeof service === "string" ? service : undefined,
        serviceId: typeof serviceId === "string" ? serviceId : undefined,
        serviceName: typeof serviceName === "string" ? serviceName : undefined,
        city: typeof city === "string" ? city : undefined,
        date: typeof date === "string" ? date : undefined,
        time: typeof time === "string" ? time : undefined,
        timeWindowStart:
          typeof timeWindowStart === "number" ? timeWindowStart : undefined,
        timeWindowEnd:
          typeof timeWindowEnd === "number" || timeWindowEnd === null
            ? timeWindowEnd
            : undefined,
        salonId: typeof salonId === "string" ? salonId : undefined,
        salonName: typeof salonName === "string" ? salonName : undefined,
      });
      console.debug("[BOOKING_MEMORY_MERGE]", {
        before: beforeCollected,
        incoming: {
          category,
          subcategory,
          service,
          serviceId,
          serviceName,
          city,
          date,
          time,
          timeWindowStart,
          timeWindowEnd,
          salonId,
          salonName,
        },
        after: bookingFlow.get().collected,
      });
      if (typeof safeResponse.payload.intent === "string") {
        bookingFlow.get().setLastIntent(safeResponse.payload.intent);
      }
      log("payload.collected", { ...safeResponse.payload });
    }

    transitionLog("from->to", {
      from: state.activeAgent,
      to: targetActive,
      sub: targetSub,
    });
    agentState.get().setActiveAgent(targetActive, targetSub);

    // Build Claudia's input. We forward the original user message so Claudia
    // sees the same intent Maria saw, plus any payload context Maria pre-extracted.
    // Race against a fixed budget — a hung Claudia (network blip, infinite
    // loop, missing tool reply) must never freeze the orchestrator
    // transition flag, otherwise every subsequent handoff is skipped.
    const claudiaPromise = ctx.invokeClaudia(
      ctx.userMessage,
      safeResponse.payload,
    );
    const raceResult = await withActivityTimeout(
      claudiaPromise,
      CLAUDIA_HANDOFF_TIMEOUT_MS,
    );
    if (raceResult.timedOut) {
      log("handoff.timeout", {
        targetAgent: safeResponse.targetAgent,
        timeoutMs: CLAUDIA_HANDOFF_TIMEOUT_MS,
      });
      // Surface a user-facing message so the chat doesn't look stuck.
      // targetAgent excluding "none" maps 1:1 to AgentType; the schema
      // guarantees this for handoff responses.
      const timeoutAgent =
        safeResponse.targetAgent === "none"
          ? "booking"
          : safeResponse.targetAgent;
      chatEvents.emit({
        type: "AGENT_RESPONSE",
        payload: {
          agentType: timeoutAgent,
          content: CLAUDIA_TIMEOUT_FALLBACK_MESSAGE,
          completed: true,
        },
        timestamp: Date.now(),
      });
      // The underlying Claudia call keeps running (no AbortController
      // contract on invokeClaudia). The fallback above told the user to
      // wait, so the outcome must be deterministic: on success the call
      // renders its own response through askAI; on failure we say so
      // instead of going silent after a "please wait".
      claudiaPromise
        .then(() => {
          log("handoff.background_complete", {
            targetAgent: safeResponse.targetAgent,
          });
        })
        .catch((err) => {
          log("handoff.background_failure", {
            targetAgent: safeResponse.targetAgent,
            error: err instanceof Error ? err.message : String(err),
          });
          chatEvents.emit({
            type: "AGENT_RESPONSE",
            payload: {
              agentType: timeoutAgent,
              content: CLAUDIA_BACKGROUND_FAILURE_MESSAGE,
              completed: true,
            },
            timestamp: Date.now(),
          });
        });
      return {
        outcome: "timeout",
        targetAgent: safeResponse.targetAgent,
        reason: "claudia_timeout",
      };
    }

    log("handoff.complete", { targetAgent: safeResponse.targetAgent });
    return { outcome: "handoff", targetAgent: safeResponse.targetAgent };
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
  // Faza 4 — povratak Mariji NE briše prikupljeno usred bookinga: korisnik
  // sme da pita nešto usput (ili da ispravi grešku) i nastavi gde je stao.
  // Reset samo kada je booking stvarno završen (BOOKING_SUBMIT_SUCCESS
  // postavlja state na "completed").
  if (toAgent === "maria" && bookingFlow.get().state === "completed") {
    bookingFlow.get().reset();
  }
}

/** Hard reset — used by /clear chat. */
export function resetAgentState(): void {
  agentState.get().reset();
  bookingFlow.get().reset();
}

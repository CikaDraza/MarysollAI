// src/lib/ai/workflow/booking-workflow-store.ts
//
// Task 6 — Booking Workflow State Machine (store).
//
// Lightweight, dependency-free state machine (no XState) backed by a
// Zustand store so non-React code (systemActionDispatcher, orchestrator)
// can read/write it directly. The transition function is exported as a
// pure helper so tests can verify the table without spinning up the store.
//
// Goal: deterministic booking flow that the AI cannot bypass. The store
// records state and may emit a narrow set of UI commands for high-risk
// transitions. The legacy `bookingFlow` (booking-flow-state.ts) and the
// systemActionDispatcher's existing UI command emissions are NOT touched
// — Task 6 layers on top.

import { create } from "zustand";
import {
  normalizeBookingPayload,
  validateBookingPayload,
  type BookingModalSlot,
} from "@/lib/booking/bookingPayload";
import { executeUICommand } from "@/lib/ai/ui/ui-command-executor";
import { isSystemActionEvent } from "@/lib/ai/events/chat-event-types";
import type { SearchResult } from "@/types/slots";
import type {
  BookingWorkflowContext,
  BookingWorkflowEvent,
  BookingWorkflowStep,
} from "./booking-workflow-types";

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

function log(
  label: "[BOOKING_WORKFLOW]" | "[BOOKING_WORKFLOW_INVALID]",
  details: Record<string, unknown>,
): void {
  if (!isDev()) return;
  if (label === "[BOOKING_WORKFLOW_INVALID]") {
    console.warn(label, details);
    return;
  }
  console.debug(label, details);
}

// ── Guards ────────────────────────────────────────────────────────────────

function slotFromCtx(ctx: BookingWorkflowContext): BookingModalSlot | undefined {
  const slot =
    (ctx.selectedSlot as unknown as BookingModalSlot | undefined) ??
    (ctx.bookingPayload as BookingModalSlot | undefined) ??
    (ctx.pendingBooking as BookingModalSlot | undefined);
  return slot && typeof slot === "object" ? slot : undefined;
}

/** AI / legacy callers may try to open the booking modal without a slot
 * fully resolved. Workflow refuses to advance to `confirming_booking`
 * unless the payload validates. */
export function canOpenBookingModal(ctx: BookingWorkflowContext): boolean {
  const slot = slotFromCtx(ctx);
  if (!slot) return false;
  return validateBookingPayload(normalizeBookingPayload(slot)).ok;
}

/** The booking-submit transition is only allowed from confirming_booking
 * with a complete payload. */
export function canSubmitBooking(
  step: BookingWorkflowStep,
  ctx: BookingWorkflowContext,
): boolean {
  if (step !== "confirming_booking") return false;
  return canOpenBookingModal(ctx);
}

// ── Transition table ──────────────────────────────────────────────────────

interface TransitionResult {
  nextStep: BookingWorkflowStep;
  nextContext: BookingWorkflowContext;
  allowed: boolean;
  reason: string;
}

/** Extract the discriminator used by the transition table. */
function eventKey(event: BookingWorkflowEvent): string {
  if (isSystemActionEvent(event)) return event.action;
  return event.type;
}

/** Merge new context fields into the previous context. Undefined values
 * are dropped so we never wipe a known field with an incoming
 * unknown one. */
function mergeContext(
  prev: BookingWorkflowContext,
  patch: Partial<BookingWorkflowContext>,
): BookingWorkflowContext {
  const next: BookingWorkflowContext = { ...prev };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    (next as Record<string, unknown>)[k] = v;
  }
  return next;
}

function selectedSlotFromEvent(
  event: BookingWorkflowEvent,
): SearchResult | undefined {
  if (!isSystemActionEvent(event)) return undefined;
  const slot = event.payload?.selectedSlot;
  if (slot && typeof slot === "object") return slot as SearchResult;
  return undefined;
}

function pendingBookingFromEvent(
  event: BookingWorkflowEvent,
): Record<string, unknown> | undefined {
  if (!isSystemActionEvent(event)) return undefined;
  const p = event.payload?.pendingBooking ?? event.payload?.selectedSlot;
  if (p && typeof p === "object") return p as Record<string, unknown>;
  return undefined;
}

/** Pure transition function. Computes the next (step, context, allowed,
 * reason) for a given (step, context, event). Side-effect free so tests
 * can call it directly; the store wraps it for live state. */
export function computeTransition(
  prevStep: BookingWorkflowStep,
  prevContext: BookingWorkflowContext,
  event: BookingWorkflowEvent,
): TransitionResult {
  const key = eventKey(event);

  // Global RESET → idle, drop context.
  if (key === "RESET") {
    return {
      nextStep: "idle",
      nextContext: {},
      allowed: true,
      reason: "reset",
    };
  }

  // LOGIN_REQUIRED is allowed from anywhere — we always snapshot the
  // current selectedSlot/bookingPayload into pendingBooking so the user
  // can resume after login.
  if (key === "LOGIN_REQUIRED") {
    const pending =
      pendingBookingFromEvent(event) ??
      (prevContext.selectedSlot as unknown as Record<string, unknown>) ??
      prevContext.bookingPayload;
    return {
      nextStep: "auth_required",
      nextContext: mergeContext(prevContext, {
        authRequired: true,
        pendingBooking: pending,
      }),
      allowed: true,
      reason: "login_required",
    };
  }

  // LOGIN_SUCCESS resumes if a pendingBooking is on file, otherwise idle.
  if (key === "LOGIN_SUCCESS") {
    const pending =
      pendingBookingFromEvent(event) ?? prevContext.pendingBooking;
    if (pending) {
      const nextCtx = mergeContext(prevContext, {
        authRequired: false,
        pendingBooking: pending,
        // Restore the slot so canOpenBookingModal can re-validate it.
        selectedSlot: pending as unknown as SearchResult,
      });
      if (canOpenBookingModal(nextCtx)) {
        return {
          nextStep: "confirming_booking",
          nextContext: nextCtx,
          allowed: true,
          reason: "login_success_resume_booking",
        };
      }
      return {
        nextStep: "validating_payload",
        nextContext: nextCtx,
        allowed: true,
        reason: "login_success_pending_invalid",
      };
    }
    return {
      nextStep: "idle",
      nextContext: { ...prevContext, authRequired: false },
      allowed: true,
      reason: "login_success_no_pending",
    };
  }

  // NOTIFY_ME_CREATED → notify_me_offer (from any step), idle after a
  // visit through the offer is the caller's responsibility (or RESET).
  if (key === "NOTIFY_ME_CREATED") {
    return {
      nextStep: "notify_me_offer",
      nextContext: mergeContext(prevContext, {
        source: isSystemActionEvent(event) ? event.source : prevContext.source,
      }),
      allowed: true,
      reason: "notify_me_created",
    };
  }

  // SLOT_SELECTED — allowed from any "pre-confirmation" step. Payload
  // validity decides whether we land in slot_selected or validating_payload.
  if (key === "SLOT_SELECTED") {
    const incoming = selectedSlotFromEvent(event);
    if (!incoming) {
      return {
        nextStep: "validating_payload",
        nextContext: mergeContext(prevContext, {
          lastError: "slot_selected_missing_payload",
        }),
        allowed: true,
        reason: "slot_selected_no_payload",
      };
    }
    const nextCtx = mergeContext(prevContext, { selectedSlot: incoming });
    if (canOpenBookingModal(nextCtx)) {
      return {
        nextStep: "slot_selected",
        nextContext: nextCtx,
        allowed: true,
        reason: "slot_selected_valid",
      };
    }
    return {
      nextStep: "validating_payload",
      nextContext: nextCtx,
      allowed: true,
      reason: "slot_selected_payload_incomplete",
    };
  }

  // BOOKING_PAYLOAD_INCOMPLETE — record reason, stay in validating_payload.
  if (key === "BOOKING_PAYLOAD_INCOMPLETE") {
    return {
      nextStep: "validating_payload",
      nextContext: mergeContext(prevContext, {
        recoveryReason: "payload_incomplete",
      }),
      allowed: true,
      reason: "payload_incomplete",
    };
  }

  // BOOKING_MODAL_OPENED — only valid from slot_selected / validating_payload
  // / auth_required (resumed). Requires a valid slot.
  if (key === "BOOKING_MODAL_OPENED") {
    if (
      prevStep !== "slot_selected" &&
      prevStep !== "validating_payload" &&
      prevStep !== "auth_required" &&
      prevStep !== "confirming_booking" &&
      prevStep !== "idle"
    ) {
      return {
        nextStep: prevStep,
        nextContext: prevContext,
        allowed: false,
        reason: `booking_modal_open_forbidden_from_${prevStep}`,
      };
    }
    if (!canOpenBookingModal(prevContext)) {
      return {
        nextStep: "validating_payload",
        nextContext: prevContext,
        allowed: false,
        reason: "booking_modal_open_missing_payload",
      };
    }
    return {
      nextStep: "confirming_booking",
      nextContext: prevContext,
      allowed: true,
      reason: "booking_modal_opened",
    };
  }

  // BOOKING_MODAL_CLOSED without submission → back to slot_selected
  // (user dismissed; selection is still valid for re-entry).
  if (key === "BOOKING_MODAL_CLOSED") {
    if (prevStep === "confirming_booking") {
      return {
        nextStep: "slot_selected",
        nextContext: prevContext,
        allowed: true,
        reason: "booking_modal_closed",
      };
    }
    // Closing from anywhere else is a no-op — likely a stale event.
    return {
      nextStep: prevStep,
      nextContext: prevContext,
      allowed: false,
      reason: "booking_modal_close_ignored",
    };
  }

  // BOOKING_SUBMIT_STARTED — only from confirming_booking and with a
  // valid payload. AI cannot fire this from idle to skip confirmation.
  if (key === "BOOKING_SUBMIT_STARTED") {
    if (!canSubmitBooking(prevStep, prevContext)) {
      return {
        nextStep: prevStep,
        nextContext: prevContext,
        allowed: false,
        reason: `submit_forbidden_from_${prevStep}`,
      };
    }
    return {
      nextStep: "booking_submitting",
      nextContext: prevContext,
      allowed: true,
      reason: "submit_started",
    };
  }

  if (key === "BOOKING_SUBMIT_SUCCESS") {
    return {
      nextStep: "booking_success",
      nextContext: mergeContext(prevContext, {
        lastError: undefined,
        recoveryReason: undefined,
      }),
      allowed: true,
      reason: "submit_success",
    };
  }

  if (key === "BOOKING_SUBMIT_FAILED") {
    const error =
      (isSystemActionEvent(event) && typeof event.payload?.error === "string"
        ? (event.payload.error as string)
        : undefined) ?? "unknown_error";
    return {
      nextStep: "booking_failed",
      nextContext: mergeContext(prevContext, { lastError: error }),
      allowed: true,
      reason: "submit_failed",
    };
  }

  if (key === "BOOKING_CONFLICT") {
    return {
      nextStep: "booking_conflict_recovery",
      nextContext: mergeContext(prevContext, {
        recoveryReason: "booking_conflict",
      }),
      allowed: true,
      reason: "booking_conflict",
    };
  }

  // AI_INTENT — narrow handling. We only advance from idle (or from
  // collecting_intent → searching_slots when the intent firms up). Other
  // states ignore AI intents to prevent the AI from forcing a state jump.
  if (key === "AI_INTENT") {
    const payload =
      "payload" in event && event.payload
        ? (event.payload as Record<string, unknown>)
        : {};
    const intent = typeof payload.intent === "string" ? payload.intent : "";
    if (prevStep === "idle") {
      const nextStep: BookingWorkflowStep =
        intent === "search_slots" || intent === "booking"
          ? "searching_slots"
          : "collecting_intent";
      return {
        nextStep,
        nextContext: mergeContext(prevContext, { intent: payload }),
        allowed: true,
        reason: `ai_intent_${intent || "generic"}`,
      };
    }
    if (prevStep === "collecting_intent" && (intent === "search_slots" || intent === "booking")) {
      return {
        nextStep: "searching_slots",
        nextContext: mergeContext(prevContext, { intent: payload }),
        allowed: true,
        reason: "ai_intent_search_slots",
      };
    }
    // Otherwise ignore — AI cannot force a state jump.
    return {
      nextStep: prevStep,
      nextContext: prevContext,
      allowed: false,
      reason: `ai_intent_ignored_in_${prevStep}`,
    };
  }

  // APPOINTMENT_CANCELLED / APPOINTMENT_UPDATED — out of scope for this
  // workflow (handled by appointments flow). Workflow stays in current step.
  return {
    nextStep: prevStep,
    nextContext: prevContext,
    allowed: false,
    reason: `unhandled_event_${key}`,
  };
}

// ── UI side effects (high-risk only) ──────────────────────────────────────

function emitUIEffectsForTransition(
  prevStep: BookingWorkflowStep,
  nextStep: BookingWorkflowStep,
  context: BookingWorkflowContext,
  event: BookingWorkflowEvent,
): void {
  // No transition? No effects.
  if (prevStep === nextStep && !isSystemActionEvent(event)) return;

  // SLOT_SELECTED → slot_selected: ensure booking modal opens for the
  // freshly chosen slot. systemActionDispatcher already does this; the
  // executor's soft ownership dedupes via modalSlotKey so a second emit
  // becomes a benign FOCUS_BLOCK.
  if (nextStep === "slot_selected") {
    const slot = slotFromCtx(context);
    if (slot && canOpenBookingModal(context)) {
      executeUICommand({
        type: "OPEN_BOOKING_MODAL",
        payload: slot,
        reason: "workflow_slot_selected",
      });
    }
    return;
  }

  // LOGIN_SUCCESS resumed → confirming_booking with a valid pending slot.
  if (
    prevStep === "auth_required" &&
    nextStep === "confirming_booking"
  ) {
    const slot = slotFromCtx(context);
    if (slot && canOpenBookingModal(context)) {
      executeUICommand({
        type: "OPEN_BOOKING_MODAL",
        payload: slot,
        reason: "workflow_login_success_resume",
      });
    }
    return;
  }

  // BOOKING_CONFLICT → state only. RecoveryEngine owns the drawer/toast/agent
  // recovery commands so the workflow machine does not duplicate UI ownership.
  if (nextStep === "booking_conflict_recovery") {
    return;
  }

  // BOOKING_SUBMIT_SUCCESS → success toast (dispatcher does NOT emit this).
  if (nextStep === "booking_success") {
    if (isSystemActionEvent(event) && event.source === "BookingModal") {
      return;
    }
    executeUICommand({
      type: "SHOW_TOAST",
      message: "Zahtev za termin je poslat salonu i čeka potvrdu.",
      variant: "success",
      reason: "workflow_booking_success",
    });
    return;
  }

  // SLOT_SELECTED → validating_payload (invalid payload). Dispatcher
  // already emits SHOW_TOAST + BOOKING_PAYLOAD_INCOMPLETE; nothing else
  // for workflow to add here.
}

// ── Store ─────────────────────────────────────────────────────────────────

interface BookingWorkflowState {
  step: BookingWorkflowStep;
  context: BookingWorkflowContext;
  transition: (event: BookingWorkflowEvent) => void;
  reset: (reason?: string) => void;
}

export const useBookingWorkflow = create<BookingWorkflowState>((set, get) => ({
  step: "idle",
  context: {},
  transition: (event) => {
    const { step, context } = get();
    const result = computeTransition(step, context, event);
    log(
      result.allowed ? "[BOOKING_WORKFLOW]" : "[BOOKING_WORKFLOW_INVALID]",
      {
        previousStep: step,
        event: eventKey(event),
        nextStep: result.nextStep,
        allowed: result.allowed,
        reason: result.reason,
      },
    );
    if (!result.allowed) return;
    set({ step: result.nextStep, context: result.nextContext });
    emitUIEffectsForTransition(step, result.nextStep, result.nextContext, event);
  },
  reset: (reason) => {
    log("[BOOKING_WORKFLOW]", {
      previousStep: get().step,
      event: "RESET",
      nextStep: "idle",
      allowed: true,
      reason: reason ?? "reset",
    });
    set({ step: "idle", context: {} });
  },
}));

/** Non-React accessor — mirrors the `bookingFlow` pattern in
 * booking-flow-state.ts so non-React modules (systemActionDispatcher,
 * orchestrator) can read/write without a hook. */
export const bookingWorkflow = {
  get: () => useBookingWorkflow.getState(),
  transition: (event: BookingWorkflowEvent) =>
    useBookingWorkflow.getState().transition(event),
  reset: (reason?: string) => useBookingWorkflow.getState().reset(reason),
  subscribe: useBookingWorkflow.subscribe,
};

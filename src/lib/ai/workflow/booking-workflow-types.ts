// src/lib/ai/workflow/booking-workflow-types.ts
//
// Task 6 — Booking Workflow State Machine (types).
//
// Defines the discrete states a booking can be in, the context payload
// each state carries, and the union of events that can drive a transition.
//
// Goal: make booking transitions deterministic, observable, and impossible
// for the AI (or any legacy caller) to skip. The store itself
// (booking-workflow-store.ts) owns the transition table; this file is the
// vocabulary both producers (systemActionDispatcher, AI orchestrator) and
// consumers (UI surface owners, tests) share.

import type { SystemActionEvent } from "@/lib/ai/events/chat-event-types";
import type { SearchResult } from "@/types/slots";

/** Discrete steps of the booking workflow.
 *
 * Not every step is reachable from every other step — see
 * `BOOKING_WORKFLOW_TRANSITIONS` in booking-workflow-store.ts for the
 * actual transition table. The machine is intentionally small: it tracks
 * just the booking flow, not appointment management or auth in general. */
export type BookingWorkflowStep =
  | "idle"
  | "collecting_intent"
  | "searching_slots"
  | "showing_slots"
  | "slot_selected"
  | "validating_payload"
  | "confirming_booking"
  | "auth_required"
  | "booking_submitting"
  | "booking_success"
  | "booking_conflict_recovery"
  | "booking_failed"
  | "notify_me_offer"
  | "cancel_confirm"
  | "reschedule_search";

/** Per-step context. Fields are accumulated over the lifetime of one
 * booking attempt and cleared on RESET / completion. Optional everywhere
 * — different steps populate different subsets. */
export interface BookingWorkflowContext {
  intent?: Record<string, unknown>;
  selectedSlot?: SearchResult;
  bookingPayload?: Record<string, unknown>;
  /** Snapshot of selectedSlot/bookingPayload at the moment auth was
   * demanded. Used to resume after LOGIN_SUCCESS. */
  pendingBooking?: Record<string, unknown>;
  authRequired?: boolean;
  lastError?: string;
  recoveryReason?: string;
  source?: string;
}

/** Events that drive transitions. SystemActionEvent is the common case
 * (UI/legacy block fires a SLOT_SELECTED, dispatcher forwards it to the
 * workflow). AI_INTENT is for orchestrator handoffs that haven't been
 * mapped to a SystemAction yet. RESET clears everything. */
export type BookingWorkflowEvent =
  | SystemActionEvent
  | { type: "AI_INTENT"; payload: Record<string, unknown> }
  | { type: "RESET"; reason?: string };

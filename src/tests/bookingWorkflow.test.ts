// src/tests/bookingWorkflow.test.ts
//
// Task 6 — Booking workflow state machine.
import {
  computeTransition,
  bookingWorkflow,
  canOpenBookingModal,
  canSubmitBooking,
  useBookingWorkflow,
} from "@/lib/ai/workflow/booking-workflow-store";
import { uiCommandBus } from "@/lib/ai/ui/ui-command-executor";
import type { UICommand } from "@/lib/ai/ui/ui-command-types";
import type { SystemActionEvent } from "@/lib/ai/events/chat-event-types";
import type { SearchResult } from "@/types/slots";
import type { BookingWorkflowContext } from "@/lib/ai/workflow/booking-workflow-types";

const validSlot: SearchResult = {
  salonId: "salon-1",
  salonName: "Shi Sham",
  serviceId: "service-1",
  serviceName: "Feniranje",
  category: "hair",
  startTime: "2026-05-19T14:45:00.000Z",
  city: "Novi Sad",
  price: 1500,
  serviceDuration: 45,
  dateLabel: "Danas",
  timeLabel: "14:45",
  relevanceScore: 100,
  fallbackLevel: 1,
};

function systemAction(
  action: SystemActionEvent["action"],
  payload?: Record<string, unknown>,
): SystemActionEvent {
  return {
    type: "system_action",
    action,
    source: "BookingWidget",
    payload,
    visibleInThread: false,
    timestamp: Date.now(),
  };
}

/** Capture every UICommand emitted between the call and the returned
 * teardown function. Reset the executor first so prior tests don't bleed. */
function captureUICommands(): { commands: UICommand[]; unsubscribe: () => void } {
  uiCommandBus.resetForTests();
  const commands: UICommand[] = [];
  const unsubscribe = uiCommandBus.subscribe((c) => commands.push(c));
  return { commands, unsubscribe };
}

beforeEach(() => {
  // Each test gets a fresh workflow + executor state.
  useBookingWorkflow.setState({ step: "idle", context: {} });
  uiCommandBus.resetForTests();
});

describe("booking workflow — transition table", () => {
  test("1. idle + SLOT_SELECTED valid → slot_selected + OPEN_BOOKING_MODAL", () => {
    const { commands } = captureUICommands();
    bookingWorkflow.transition(
      systemAction("SLOT_SELECTED", { selectedSlot: validSlot }),
    );
    expect(bookingWorkflow.get().step).toBe("slot_selected");
    expect(commands.some((c) => c.type === "OPEN_BOOKING_MODAL")).toBe(true);
  });

  test("2. SLOT_SELECTED invalid → validating_payload (no booking modal)", () => {
    const incompleteSlot = { salonId: "", serviceName: "" } as Partial<SearchResult>;
    const { commands } = captureUICommands();
    bookingWorkflow.transition(
      systemAction("SLOT_SELECTED", { selectedSlot: incompleteSlot }),
    );
    expect(bookingWorkflow.get().step).toBe("validating_payload");
    expect(commands.some((c) => c.type === "OPEN_BOOKING_MODAL")).toBe(false);
  });

  test("3. confirming_booking + BOOKING_SUBMIT_STARTED → booking_submitting", () => {
    useBookingWorkflow.setState({
      step: "confirming_booking",
      context: { selectedSlot: validSlot },
    });
    bookingWorkflow.transition(systemAction("BOOKING_SUBMIT_STARTED"));
    expect(bookingWorkflow.get().step).toBe("booking_submitting");
  });

  test("4. booking_submitting + BOOKING_SUBMIT_SUCCESS → booking_success", () => {
    useBookingWorkflow.setState({
      step: "booking_submitting",
      context: { selectedSlot: validSlot },
    });
    const { commands } = captureUICommands();
    bookingWorkflow.transition(systemAction("BOOKING_SUBMIT_SUCCESS"));
    expect(bookingWorkflow.get().step).toBe("booking_success");
    expect(
      commands.some(
        (c) => c.type === "SHOW_TOAST" && c.variant === "success",
      ),
    ).toBe(true);
  });

  test("5. booking_submitting + BOOKING_CONFLICT → booking_conflict_recovery", () => {
    useBookingWorkflow.setState({
      step: "booking_submitting",
      context: { selectedSlot: validSlot },
    });
    const { commands } = captureUICommands();
    bookingWorkflow.transition(systemAction("BOOKING_CONFLICT"));
    expect(bookingWorkflow.get().step).toBe("booking_conflict_recovery");
    expect(commands.some((c) => c.type === "OPEN_DRAWER")).toBe(false);
  });

  test("6. any + LOGIN_REQUIRED → auth_required (snapshots pendingBooking)", () => {
    useBookingWorkflow.setState({
      step: "slot_selected",
      context: { selectedSlot: validSlot },
    });
    bookingWorkflow.transition(
      systemAction("LOGIN_REQUIRED", { selectedSlot: validSlot }),
    );
    expect(bookingWorkflow.get().step).toBe("auth_required");
    expect(bookingWorkflow.get().context.authRequired).toBe(true);
    expect(bookingWorkflow.get().context.pendingBooking).toBeTruthy();
  });

  test("7. auth_required + LOGIN_SUCCESS w/ pendingBooking → confirming_booking + OPEN_BOOKING_MODAL", () => {
    useBookingWorkflow.setState({
      step: "auth_required",
      context: {
        authRequired: true,
        pendingBooking: validSlot as unknown as Record<string, unknown>,
      },
    });
    const { commands } = captureUICommands();
    bookingWorkflow.transition(systemAction("LOGIN_SUCCESS"));
    expect(bookingWorkflow.get().step).toBe("confirming_booking");
    expect(commands.some((c) => c.type === "OPEN_BOOKING_MODAL")).toBe(true);
  });

  test("7b. auth_required + LOGIN_SUCCESS without pendingBooking → idle", () => {
    useBookingWorkflow.setState({
      step: "auth_required",
      context: { authRequired: true },
    });
    bookingWorkflow.transition(systemAction("LOGIN_SUCCESS"));
    expect(bookingWorkflow.get().step).toBe("idle");
  });

  test("8. invalid transition logs warning and does not crash or change state", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    useBookingWorkflow.setState({ step: "idle", context: {} });
    // BOOKING_SUBMIT_STARTED from idle is forbidden — submit guard blocks it.
    bookingWorkflow.transition(systemAction("BOOKING_SUBMIT_STARTED"));
    expect(bookingWorkflow.get().step).toBe("idle");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("9. AI cannot open booking modal without selectedSlot (guard)", () => {
    const ctx: BookingWorkflowContext = {};
    expect(canOpenBookingModal(ctx)).toBe(false);
    expect(canSubmitBooking("confirming_booking", ctx)).toBe(false);
    // BOOKING_MODAL_OPENED from idle with empty context should be rejected.
    const result = computeTransition("idle", ctx, systemAction("BOOKING_MODAL_OPENED"));
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/missing_payload/);
  });

  test("10. RESET returns to idle and clears context", () => {
    useBookingWorkflow.setState({
      step: "booking_failed",
      context: { selectedSlot: validSlot, lastError: "network" },
    });
    bookingWorkflow.transition({ type: "RESET" });
    expect(bookingWorkflow.get().step).toBe("idle");
    expect(bookingWorkflow.get().context).toEqual({});
  });
});

describe("booking workflow — AI intent guard", () => {
  test("AI_INTENT advances idle → searching_slots for search_slots intent", () => {
    const result = computeTransition(
      "idle",
      {},
      { type: "AI_INTENT", payload: { intent: "search_slots" } },
    );
    expect(result.allowed).toBe(true);
    expect(result.nextStep).toBe("searching_slots");
  });

  test("AI_INTENT cannot force jump from confirming_booking", () => {
    const result = computeTransition(
      "confirming_booking",
      { selectedSlot: validSlot },
      { type: "AI_INTENT", payload: { intent: "search_slots" } },
    );
    expect(result.allowed).toBe(false);
    expect(result.nextStep).toBe("confirming_booking");
  });

  test("BOOKING_SUBMIT_STARTED from idle is blocked (cannot skip confirm)", () => {
    const result = computeTransition(
      "idle",
      { selectedSlot: validSlot },
      systemAction("BOOKING_SUBMIT_STARTED"),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/submit_forbidden/);
  });
});

describe("booking workflow — guards", () => {
  test("canOpenBookingModal accepts a fully formed slot", () => {
    expect(canOpenBookingModal({ selectedSlot: validSlot })).toBe(true);
  });

  test("canOpenBookingModal rejects a slot missing required fields", () => {
    const incomplete = { salonId: "x" } as unknown as SearchResult;
    expect(canOpenBookingModal({ selectedSlot: incomplete })).toBe(false);
  });

  test("canSubmitBooking requires confirming_booking step", () => {
    expect(canSubmitBooking("slot_selected", { selectedSlot: validSlot })).toBe(
      false,
    );
    expect(
      canSubmitBooking("confirming_booking", { selectedSlot: validSlot }),
    ).toBe(true);
  });
});

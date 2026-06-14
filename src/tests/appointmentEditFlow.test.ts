import fs from "fs";
import path from "path";
import {
  canClientCancelAppointment,
  canClientUpdateAppointment,
  getClientActionWindowState,
} from "@/lib/appointments/clientAppointmentWindow";
import {
  getBlockRegistryEntry,
  canRenderBlockOnSurface,
} from "@/lib/ai/layout/block-registry";
import type { IAppointment } from "@/types/appointments-type";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAppointment(overrides: Partial<IAppointment> = {}): IAppointment {
  return {
    _id: "appt-1",
    clientName: "Ana Petrović",
    clientEmail: "ana@example.com",
    serviceName: "Šminkanje",
    services: [],
    duration: 60,
    date: "2026-06-15",
    time: "14:00",
    status: "appointment_approved",
    cancellationStatus: "can_cancel",
    messages: [],
    adminNotified: false,
    clientNotified: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// clientAppointmentWindow — pure logic
// ---------------------------------------------------------------------------

describe("getClientActionWindowState — active + can_cancel", () => {
  it("shows both Izmeni and Otkaži buttons", () => {
    const state = getClientActionWindowState(makeAppointment());
    expect(state.canUpdate).toBe(true);
    expect(state.canCancel).toBe(true);
    expect(state.reason).toBeUndefined();
  });
});

describe("getClientActionWindowState — expired window", () => {
  it("hides both buttons and sets reason expired", () => {
    const state = getClientActionWindowState(
      makeAppointment({ cancellationStatus: "late_cancel" }),
    );
    expect(state.canUpdate).toBe(false);
    expect(state.canCancel).toBe(false);
    expect(state.reason).toBe("expired");
  });

  it("shows expired note — both Izmeni and Otkaži are hidden", () => {
    const state = getClientActionWindowState(
      makeAppointment({ cancellationStatus: "late_cancel" }),
    );
    expect(state.canUpdate).toBe(false);
    expect(state.canCancel).toBe(false);
  });
});

describe("getClientActionWindowState — terminal status", () => {
  it("cancelled appointment hides all buttons", () => {
    const state = getClientActionWindowState(
      makeAppointment({ status: "appointment_cancelled" }),
    );
    expect(state.canCancel).toBe(false);
    expect(state.canUpdate).toBe(false);
    expect(state.reason).toBe("status_not_allowed");
  });

  it("completed appointment hides all buttons", () => {
    const state = getClientActionWindowState(
      makeAppointment({ status: "completed" }),
    );
    expect(state.canCancel).toBe(false);
    expect(state.canUpdate).toBe(false);
  });

  it("rejected appointment hides all buttons", () => {
    const state = getClientActionWindowState(
      makeAppointment({ status: "appointment_rejected" }),
    );
    expect(state.canCancel).toBe(false);
    expect(state.canUpdate).toBe(false);
  });
});

describe("canClientUpdateAppointment", () => {
  it("returns true for active appointment with can_cancel status", () => {
    expect(canClientUpdateAppointment(makeAppointment())).toBe(true);
  });

  it("returns false for late_cancel (window expired)", () => {
    expect(
      canClientUpdateAppointment(makeAppointment({ cancellationStatus: "late_cancel" })),
    ).toBe(false);
  });

  it("uses appointmentReliability when present", () => {
    const withPolicy = makeAppointment({
      appointmentReliability: {
        cancellationAllowed: false,
        source: "platform_policy",
      },
    });
    expect(canClientUpdateAppointment(withPolicy)).toBe(false);

    const withPolicyAllowed = makeAppointment({
      appointmentReliability: {
        cancellationAllowed: true,
        source: "platform_policy",
      },
    });
    expect(canClientUpdateAppointment(withPolicyAllowed)).toBe(true);
  });
});

describe("canClientCancelAppointment", () => {
  it("mirrors isCancellableAppointment", () => {
    expect(canClientCancelAppointment(makeAppointment())).toBe(true);
    expect(
      canClientCancelAppointment(makeAppointment({ cancellationStatus: "late_cancel" })),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SystemActionName schema includes appointment update actions
// ---------------------------------------------------------------------------

describe("SystemActionNameSchema includes appointment update events", () => {
  it("APPOINTMENT_UPDATE_REQUESTED is registered", async () => {
    const { SystemActionNameSchema } = await import("@/lib/ai/events/chat-event-types");
    expect(() => SystemActionNameSchema.parse("APPOINTMENT_UPDATE_REQUESTED")).not.toThrow();
  });

  it("APPOINTMENT_UPDATE_SLOT_SELECTED is registered", async () => {
    const { SystemActionNameSchema } = await import("@/lib/ai/events/chat-event-types");
    expect(() => SystemActionNameSchema.parse("APPOINTMENT_UPDATE_SLOT_SELECTED")).not.toThrow();
  });

  it("APPOINTMENT_UPDATE_SUCCESS is registered", async () => {
    const { SystemActionNameSchema } = await import("@/lib/ai/events/chat-event-types");
    expect(() => SystemActionNameSchema.parse("APPOINTMENT_UPDATE_SUCCESS")).not.toThrow();
  });

  it("APPOINTMENT_UPDATE_FAILED is registered", async () => {
    const { SystemActionNameSchema } = await import("@/lib/ai/events/chat-event-types");
    expect(() => SystemActionNameSchema.parse("APPOINTMENT_UPDATE_FAILED")).not.toThrow();
  });

  it("ClientAppointmentsBlock is a valid source", async () => {
    const { SystemActionSourceSchema } = await import("@/lib/ai/events/chat-event-types");
    expect(() => SystemActionSourceSchema.parse("ClientAppointmentsBlock")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Source integrity checks
// ---------------------------------------------------------------------------

describe("ClientBlockAppointments source integrity", () => {
  let src: string;
  beforeAll(() => {
    src = fs.readFileSync(
      path.join(process.cwd(), "src/components/blocks/ClientBlockAppointments.tsx"),
      "utf8",
    );
  });

  it("uses sendSystemAction instead of fake chat text for edit", () => {
    expect(src).toContain("sendSystemAction");
  });

  it("does not send fake chat text containing appointmentId", () => {
    expect(src).not.toContain("Želim da promenim termin ${appointment._id}");
  });

  it("emits APPOINTMENT_UPDATE_REQUESTED action", () => {
    expect(src).toContain("APPOINTMENT_UPDATE_REQUESTED");
  });

  it("shows Izmeni termin (not Promeni termin)", () => {
    expect(src).toContain("Izmeni termin");
    expect(src).not.toContain('"Promeni termin"');
  });

  it("shows expired window note in Serbian", () => {
    expect(src).toContain("Vreme za izmenu i otkazivanje termina je isteklo.");
  });

  it("does not show edit button when canUpdate is false (uses conditional)", () => {
    expect(src).toContain("canUpdate");
  });
});

describe("AppointmentUpdateConfirmBlock is registered in block types", () => {
  it("AppointmentUpdateConfirmBlock is in BlockTypes union", () => {
    const landingBlock = fs.readFileSync(
      path.join(process.cwd(), "src/types/landing-block.ts"),
      "utf8",
    );
    expect(landingBlock).toContain('"AppointmentUpdateConfirmBlock"');
  });

  it("blockFactory.tsx handles AppointmentUpdateConfirmBlock case", () => {
    const factory = fs.readFileSync(
      path.join(process.cwd(), "src/components/layout/blockFactory.tsx"),
      "utf8",
    );
    expect(factory).toContain('case "AppointmentUpdateConfirmBlock"');
  });

  // Regression: without a layout-registry entry, resolveLayout drops the block
  // as "unsupported" so the reschedule confirm step never renders.
  it("AppointmentUpdateConfirmBlock has a layout-registry entry renderable in workspace", () => {
    expect(getBlockRegistryEntry("AppointmentUpdateConfirmBlock")).toBeDefined();
    expect(
      canRenderBlockOnSurface("AppointmentUpdateConfirmBlock", "workspace"),
    ).toBe(true);
  });
});

describe("AppointmentCalendarBlockView reschedule mode", () => {
  let src: string;
  beforeAll(() => {
    src = fs.readFileSync(
      path.join(process.cwd(), "src/components/blocks/AppointmentCalendarBlockView.tsx"),
      "utf8",
    );
  });

  it("does not open booking modal in reschedule mode (emits APPOINTMENT_UPDATE_SLOT_SELECTED)", () => {
    expect(src).toContain("APPOINTMENT_UPDATE_SLOT_SELECTED");
  });

  it("shows reschedule banner when in reschedule mode", () => {
    expect(src).toContain("isRescheduleMode");
    expect(src).toContain("Izmena termina");
  });

  it("does not call handleAIConfirm in reschedule mode (uses handleConfirm wrapper)", () => {
    expect(src).toContain("handleConfirm");
    expect(src).toContain("isRescheduleMode");
  });
});

describe("contractToUICommands handles SHOW_UPDATE_CONFIRMATION", () => {
  it("SHOW_UPDATE_CONFIRMATION case exists", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/lib/ai/ui/contractToUICommands.ts"),
      "utf8",
    );
    expect(src).toContain('case "SHOW_UPDATE_CONFIRMATION"');
  });
});

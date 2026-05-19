import { createThreadItemsFromChatEvent } from "@/lib/ai/createThreadItems";
import { chatEvents } from "@/lib/ai/events/chatEvents";
import type { SystemActionEvent } from "@/lib/ai/events/chat-event-types";
import { handleRecoveryEvent } from "@/lib/ai/recovery/recovery-engine";
import type { RecoveryEvent } from "@/lib/ai/recovery/recovery-types";
import {
  executeUICommand,
  uiCommandBus,
} from "@/lib/ai/ui/ui-command-executor";
import type { UICommand } from "@/lib/ai/ui/ui-command-types";
import type { SearchResult } from "@/types/slots";

const selectedSlot: SearchResult = {
  salonId: "salon-1",
  salonName: "Shi Sham",
  serviceId: "service-1",
  serviceName: "Feniranje",
  category: "hair",
  startTime: "2026-05-14T14:45:00.000Z",
  city: "Novi Sad",
  price: 1500,
  serviceDuration: 45,
  dateLabel: "Danas",
  timeLabel: "14:45",
  relevanceScore: 100,
  fallbackLevel: 1,
};

function collectUICommands(): UICommand[] {
  const commands: UICommand[] = [];
  uiCommandBus.subscribe((command) => commands.push(command));
  return commands;
}

function collectSystemActions(): SystemActionEvent[] {
  const events: SystemActionEvent[] = [];
  chatEvents.subscribe("system_action", (event) => {
    if (event.type === "system_action") events.push(event);
  });
  return events;
}

function recovery(overrides: Partial<RecoveryEvent>): RecoveryEvent {
  return {
    type: "recovery",
    reason: "unknown",
    severity: "recoverable",
    source: "BookingModal",
    payload: {},
    notifyAgent: false,
    visibleInThread: false,
    timestamp: 1,
    ...overrides,
  };
}

describe("RecoveryEngine", () => {
  beforeEach(() => {
    uiCommandBus.resetForTests();
    jest.spyOn(console, "debug").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    uiCommandBus.resetForTests();
  });

  it("slot_taken recovery emits OPEN_DRAWER and booking_conflict handoff", () => {
    const commands = collectUICommands();
    const actions = collectSystemActions();

    handleRecoveryEvent(
      recovery({
        reason: "slot_taken",
        severity: "recoverable",
        payload: { selectedSlot },
        notifyAgent: true,
      }),
    );

    expect(commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "OPEN_DRAWER" }),
        expect.objectContaining({ type: "SHOW_TOAST", reason: "slot_taken_recovery" }),
      ]),
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "BOOKING_CONFLICT",
          payload: expect.objectContaining({ intent: "booking_conflict" }),
        }),
      ]),
    );
  });

  it("missing_salon with city/service emits SalonListBlock", () => {
    const commands = collectUICommands();

    handleRecoveryEvent(
      recovery({
        reason: "missing_salon",
        payload: {
          selectedSlot: { ...selectedSlot, salonId: "", salonName: "" },
          missingFields: ["salonId", "salonName"],
          city: "Novi Sad",
          service: "Feniranje",
          salons: [{ id: "salon-1", name: "Shi Sham" }],
        },
      }),
    );

    expect(commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "RENDER_BLOCK",
          block: expect.objectContaining({ type: "SalonListBlock" }),
        }),
      ]),
    );
  });

  it("missing_salon without enough data opens drawer for clarification", () => {
    const commands = collectUICommands();

    handleRecoveryEvent(
      recovery({
        reason: "missing_salon",
        payload: {
          selectedSlot: { ...selectedSlot, salonId: "", salonName: "", city: "" },
          missingFields: ["salonId", "salonName"],
        },
        notifyAgent: true,
      }),
    );

    expect(commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "OPEN_DRAWER" }),
      ]),
    );
  });

  it("missing_start_time with date/time computes startTime and continues", () => {
    const commands = collectUICommands();
    const slot = {
      ...selectedSlot,
      startTime: "",
      date: "2026-05-17",
      time: "14:30",
    };

    handleRecoveryEvent(
      recovery({
        reason: "missing_start_time",
        payload: { selectedSlot: slot, date: "2026-05-17", time: "14:30" },
      }),
    );

    expect(commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "OPEN_BOOKING_MODAL",
          payload: expect.objectContaining({
            startTime: expect.stringContaining("2026-05-17"),
            timeLabel: "14:30",
          }),
        }),
      ]),
    );
  });

  it("missing_contact shows Serbian toast and does not call AI", () => {
    const commands = collectUICommands();
    const actions = collectSystemActions();

    handleRecoveryEvent(
      recovery({
        reason: "missing_contact",
        severity: "info",
        payload: { selectedSlot },
        notifyAgent: false,
      }),
    );

    expect(commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "SHOW_TOAST",
          message: "Unesite telefon, email ili Instagram za potvrdu termina.",
        }),
      ]),
    );
    expect(actions).toEqual([]);
  });

  it("auth_required renders AuthBlock and preserves pending booking context", () => {
    const commands = collectUICommands();

    handleRecoveryEvent(
      recovery({
        reason: "auth_required",
        severity: "blocking",
        payload: { selectedSlot },
      }),
    );

    expect(commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "RENDER_BLOCK",
          block: expect.objectContaining({
            type: "AuthBlock",
            metadata: expect.objectContaining({ selectedSlot }),
          }),
        }),
      ]),
    );
  });

  it("booking_submit_failed shows Serbian toast", () => {
    const commands = collectUICommands();

    handleRecoveryEvent(recovery({ reason: "booking_submit_failed", severity: "blocking" }));

    expect(commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "SHOW_TOAST",
          message: "Zakazivanje trenutno nije uspelo. Pokušajte ponovo.",
        }),
      ]),
    );
  });

  it("cancel_expired shows Serbian toast only", () => {
    const commands = collectUICommands();

    handleRecoveryEvent(recovery({ reason: "cancel_expired", severity: "blocking" }));

    expect(commands).toEqual([
      expect.objectContaining({
        type: "SHOW_TOAST",
        message: "Vreme za otkazivanje termina je isteklo.",
      }),
    ]);
  });

  it("no_slots renders NotifyMeBlock", () => {
    const commands = collectUICommands();

    handleRecoveryEvent(
      recovery({
        reason: "no_slots",
        payload: { service: "Feniranje", city: "Novi Sad" },
      }),
    );

    expect(commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "RENDER_BLOCK",
          block: expect.objectContaining({ type: "NotifyMeBlock" }),
        }),
      ]),
    );
  });

  it("notify_created shows success toast", () => {
    const commands = collectUICommands();

    handleRecoveryEvent(recovery({ reason: "notify_created", severity: "info" }));

    expect(commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "SHOW_TOAST",
          message: "Obavestićemo vas čim se pojavi slobodan termin.",
        }),
      ]),
    );
  });

  it("RecoveryEvent never renders user bubble", () => {
    const event = recovery({ reason: "slot_taken", visibleInThread: false });

    expect(createThreadItemsFromChatEvent(event)).toEqual([]);
  });

  it("BookingModal no longer calls sendToOrchestrator with plain recovery text", () => {
    const fs = jest.requireActual("fs") as typeof import("fs");
    const path = jest.requireActual("path") as typeof import("path");
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/landing/BookingModal.tsx"),
      "utf8",
    );

    expect(source).not.toContain("sendToOrchestrator(");
    expect(source).not.toContain("Ne mogu pouzdano da povežem termin");
    expect(source).not.toContain("Termin je zauzet");
  });

  it("executeUICommand helper remains available for non-recovery UI ownership", () => {
    const commands = collectUICommands();
    executeUICommand({ type: "SHOW_TOAST", message: "OK", variant: "info" });
    expect(commands[0]).toMatchObject({ type: "SHOW_TOAST", message: "OK" });
  });
});

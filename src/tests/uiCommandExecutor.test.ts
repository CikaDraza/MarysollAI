import { blockOrchestrator } from "@/lib/ai/block-orchestrator";
import { createThreadItemsFromChatEvent } from "@/lib/ai/createThreadItems";
import { chatEvents } from "@/lib/ai/events/chatEvents";
import { sendSystemAction } from "@/lib/ai/events/systemActionDispatcher";
import type { SystemActionEvent } from "@/lib/ai/events/chat-event-types";
import type { ClaudiaContract } from "@/lib/ai/schemas/claudia-contract.schema";
import { claudiaContractToUICommands } from "@/lib/ai/ui/contractToUICommands";
import {
  executeUICommand,
  uiCommandBus,
} from "@/lib/ai/ui/ui-command-executor";
import type { UICommand } from "@/lib/ai/ui/ui-command-types";
import type { BaseBlock } from "@/types/landing-block";
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

function baseContract(overrides: Partial<ClaudiaContract>): ClaudiaContract {
  return {
    kind: "booking_result",
    message: "Pronašla sam slobodne termine.",
    workflow: { domain: "booking", step: "booking", status: "ready" },
    nextAction: { type: "SHOW_SLOTS", reason: "booking_search" },
    ui: { blocks: [], hideBlocks: [], showBlocks: [] },
    intent: {
      type: "booking",
      confidence: 1,
      entities: {
        city: "Novi Sad",
        service: "feniranje",
        slots: [selectedSlot],
      },
      missingFields: [],
    },
    ...overrides,
  };
}

describe("UICommand executor and mapping", () => {
  beforeEach(() => {
    uiCommandBus.resetForTests();
    blockOrchestrator.clear();
    jest.spyOn(console, "debug").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    uiCommandBus.resetForTests();
    blockOrchestrator.clear();
  });

  it("SHOW_SLOTS contract maps to RENDER_BLOCK AppointmentCalendarBlock", () => {
    const commands = claudiaContractToUICommands(baseContract({}));

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      type: "RENDER_BLOCK",
      surface: "workspace",
      block: {
        type: "AppointmentCalendarBlock",
        metadata: { slots: [selectedSlot], city: "Novi Sad" },
      },
    });
  });

  it("OPEN_BOOKING_MODAL command does not render user bubble", () => {
    const commands = collectUICommands();

    executeUICommand({
      type: "OPEN_BOOKING_MODAL",
      payload: selectedSlot,
      reason: "test",
    });

    expect(commands[0]).toMatchObject({ type: "OPEN_BOOKING_MODAL" });
    expect(
      createThreadItemsFromChatEvent({
        type: "system_action",
        action: "SLOT_SELECTED",
        source: "BookingWidget",
        payload: { selectedSlot },
        notifyAgent: false,
        visibleInThread: false,
        timestamp: 1,
      }),
    ).toEqual([]);
  });

  it("SLOT_SELECTED emits OPEN_BOOKING_MODAL when payload valid", () => {
    const commands = collectUICommands();

    sendSystemAction({
      action: "SLOT_SELECTED",
      source: "BookingWidget",
      payload: { selectedSlot },
      notifyAgent: false,
      visibleInThread: false,
    });

    expect(commands).toContainEqual(
      expect.objectContaining({
        type: "OPEN_BOOKING_MODAL",
        payload: expect.objectContaining({ serviceName: selectedSlot.serviceName }),
      }),
    );
  });

  it("SLOT_SELECTED with invalid payload emits BOOKING_PAYLOAD_INCOMPLETE", () => {
    const events: SystemActionEvent[] = [];
    const unsubscribe = chatEvents.subscribe("system_action", (event) => {
      if (event.type === "system_action") events.push(event);
    });

    sendSystemAction({
      action: "SLOT_SELECTED",
      source: "BookingWidget",
      payload: {
        selectedSlot: {
          ...selectedSlot,
          salonId: "",
          salonName: "",
        },
      },
      notifyAgent: false,
      visibleInThread: false,
    });

    unsubscribe();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "BOOKING_PAYLOAD_INCOMPLETE",
          payload: expect.objectContaining({
            missingFields: expect.arrayContaining(["salonId", "salonName"]),
          }),
        }),
      ]),
    );
  });

  it("BOOKING_CONFLICT emits OPEN_DRAWER", () => {
    const commands = collectUICommands();

    sendSystemAction({
      action: "BOOKING_CONFLICT",
      source: "BookingModal",
      payload: { selectedSlot },
      notifyAgent: true,
      visibleInThread: false,
    });

    expect(commands).toContainEqual(
      expect.objectContaining({ type: "OPEN_DRAWER", reason: "slot_taken_recovery" }),
    );
  });

  it("Duplicate OPEN_BOOKING_MODAL with same slot is deduped", () => {
    const commands = collectUICommands();

    executeUICommand({ type: "OPEN_BOOKING_MODAL", payload: selectedSlot });
    executeUICommand({ type: "OPEN_BOOKING_MODAL", payload: selectedSlot });

    expect(commands[0]).toMatchObject({ type: "OPEN_BOOKING_MODAL" });
    expect(commands[1]).toMatchObject({
      type: "FOCUS_BLOCK",
      blockType: "BookingModal",
    });
  });

  it("Duplicate RENDER_BLOCK focuses existing block", () => {
    const commands = collectUICommands();
    const block: BaseBlock = {
      id: "block-1",
      type: "CalendarBlock",
      priority: 1,
      metadata: { serviceId: "", serviceName: "", variantName: "", mode: "list" },
    };

    blockOrchestrator.openBlock("CalendarBlock");
    executeUICommand({ type: "RENDER_BLOCK", block });

    expect(commands[0]).toMatchObject({
      type: "FOCUS_BLOCK",
      blockType: "CalendarBlock",
    });
  });

  it("ASK_CLARIFICATION produces no UI command except assistant message", () => {
    const commands = claudiaContractToUICommands(
      baseContract({
        kind: "clarification",
        nextAction: { type: "ASK_CLARIFICATION", reason: "missing_city" },
        intent: {
          type: "booking",
          confidence: 0.8,
          entities: { service: "feniranje" },
          missingFields: ["city"],
        },
      }),
    );

    expect(commands).toEqual([]);
  });

  it("OFFER_NOTIFY_ME maps to NotifyMeBlock", () => {
    const commands = claudiaContractToUICommands(
      baseContract({
        nextAction: { type: "OFFER_NOTIFY_ME", reason: "no_slots" },
      }),
    );

    expect(commands[0]).toMatchObject({
      type: "RENDER_BLOCK",
      block: { type: "NotifyMeBlock" },
    });
  });

  it("LOGIN_SUCCESS with pending booking maps to OPEN_BOOKING_MODAL", () => {
    const commands = collectUICommands();

    sendSystemAction({
      action: "LOGIN_SUCCESS",
      source: "AuthBlock",
      payload: { user: { name: "Milica" }, pendingBooking: selectedSlot },
      notifyAgent: true,
      visibleInThread: false,
    });

    expect(commands).toContainEqual(
      expect.objectContaining({
        type: "OPEN_BOOKING_MODAL",
        payload: expect.objectContaining({ serviceName: selectedSlot.serviceName }),
      }),
    );
  });
});

import { createThreadItems, createThreadItemsFromChatEvent } from "@/lib/ai/createThreadItems";
import type { SystemActionEvent } from "@/lib/ai/events/chat-event-types";
import { systemActionToAgentRequest } from "@/lib/ai/events/systemActionDispatcher";
import { systemActionToDisplayMessage } from "@/lib/ai/events/systemActionDisplay";
import type { ThreadItem } from "@/types/ai/chat-thread";

function event(
  action: SystemActionEvent["action"],
  payload: Record<string, unknown> = {},
): SystemActionEvent {
  return {
    type: "system_action",
    action,
    actionId: "action-123",
    payload,
    source: "AgentBridge",
    visibleInThread: false,
    timestamp: Date.UTC(2026, 4, 29, 12, 0, 0),
  };
}

function isMessageItem(
  item: ThreadItem,
): item is Extract<ThreadItem, { type: "message" }> {
  return item.type === "message";
}

describe("SystemAction display messages", () => {
  it("CITY_SELECTED returns clean city text", () => {
    expect(systemActionToDisplayMessage(event("CITY_SELECTED", { city: "Bor" }))).toBe(
      "Izabran je grad Bor.",
    );
  });

  it("SERVICE_SELECTED_FOR_SALON includes salon/service labels but no IDs", () => {
    const message = systemActionToDisplayMessage(
      event("SERVICE_SELECTED_FOR_SALON", {
        city: "Bor",
        salonId: "69f0",
        serviceId: "svc-1",
        salonName: "Beauty M Glow",
        serviceName: "Maderoterapija",
        flowVersion: 7,
      }),
    );

    expect(message).toContain("Maderoterapija");
    expect(message).toContain("Beauty M Glow");
    expect(message).not.toContain("69f0");
    expect(message).not.toContain("svc-1");
    expect(message).not.toContain("flowVersion");
  });

  it("SLOT_SELECTED includes time and salon", () => {
    expect(
      systemActionToDisplayMessage(
        event("SLOT_SELECTED", { time: "15:00", salonName: "Beauty M Glow" }),
      ),
    ).toBe("Izabran je termin 15:00 u Beauty M Glow.");
  });

  it("returns null for fully silent action", () => {
    expect(systemActionToDisplayMessage(event("BOOKING_MODAL_OPENED"))).toBeNull();
  });

  it("attaches clean displayMessage while keeping internal payload IDs", () => {
    const request = systemActionToAgentRequest(
      event("SERVICE_SELECTED_FOR_SALON", {
        city: "Bor",
        salonId: "69f0",
        serviceId: "svc-1",
        salonName: "Beauty M Glow",
        serviceName: "Maderoterapija",
      }),
    );

    expect(request?.handoffPayload.displayMessage).toBe(
      "Izabrana je usluga Maderoterapija u salonu Beauty M Glow.",
    );
    expect(request?.handoffPayload.salonId).toBe("69f0");
    expect(request?.handoffPayload.serviceId).toBe("svc-1");
  });

  it("booking SystemActionEvent actions still route to Claudia booking", () => {
    expect(systemActionToAgentRequest(event("SERVICE_SELECTED_FOR_SALON"))?.agentType).toBe("booking");
    expect(systemActionToAgentRequest(event("BOOKING_CONFLICT"))?.agentType).toBe("booking");
    expect(systemActionToAgentRequest(event("LOGIN_SUCCESS", { selectedSlot: { serviceName: "Feniranje" } }))?.agentType).toBe("booking");
    expect(systemActionToAgentRequest(event("BOOKING_SUBMIT_SUCCESS"))?.agentType).toBe("booking");
  });

  it("createThreadItems does not create user bubble for system_action input", () => {
    const items = createThreadItems("system_action:SERVICE_SELECTED_FOR_SALON", {
      messages: [{ id: "a1", type: "text", role: "assistant", content: "Spremno.", attachToBlockType: "none" }],
      layout: [],
    });

    expect(items.some((item) => item.type === "message" && item.data.role === "user")).toBe(false);
  });

  it("createThreadItemsFromChatEvent does not create user bubble for system_action text", () => {
    const items = createThreadItemsFromChatEvent({
      type: "user_message",
      content: "system_action:SERVICE_SELECTED_FOR_SALON",
      visibleInThread: true,
      timestamp: Date.now(),
    });

    expect(items).toEqual([]);
  });

  it("visible assistant messages are sanitized but preserve normal Serbian text", () => {
    const items = createThreadItems("real user text", {
      messages: [
        {
          id: "a2",
          type: "text",
          role: "assistant",
          content: "Proveravam termine [salonId:abc].",
          attachToBlockType: "none",
        },
      ],
      layout: [],
    });

    const assistant = items.find(
      (item): item is Extract<ThreadItem, { type: "message" }> =>
        isMessageItem(item) && item.data.role === "assistant",
    );
    expect(assistant?.data.content).toBe("Proveravam termine.");

    const normal = createThreadItems("real user text", {
      messages: [
        {
          id: "a3",
          type: "text",
          role: "assistant",
          content: "Proveravam slobodne termine za sutra u Novom Sadu.",
          attachToBlockType: "none",
        },
      ],
      layout: [],
    });
    const normalAssistant = normal.find(
      (item): item is Extract<ThreadItem, { type: "message" }> =>
        isMessageItem(item) && item.data.role === "assistant",
    );
    expect(normalAssistant?.data.content).toBe(
      "Proveravam slobodne termine za sutra u Novom Sadu.",
    );
  });
});

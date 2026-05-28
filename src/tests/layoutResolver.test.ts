import { readFileSync } from "fs";
import path from "path";
import { chatEvents } from "@/lib/ai/events/chatEvents";
import type { SystemActionEvent } from "@/lib/ai/events/chat-event-types";
import {
  aiWorkflowBlockFactory,
  blockFactory,
  contentBlockFactory,
} from "@/components/layout/blockFactory";
import { claudiaContractToLegacyResponse } from "@/lib/ai/schemas/claudia-contract.schema";
import type { ClaudiaContract } from "@/lib/ai/schemas/claudia-contract.schema";
import { blockActionToSystemAction } from "@/lib/ai/layout/blockActionToSystemAction";
import { createThreadItems } from "@/lib/ai/createThreadItems";
import { bookingFlow } from "@/lib/ai/booking-flow-state";
import { sendSystemAction } from "@/lib/ai/events/systemActionDispatcher";
import {
  getBlockRegistryEntry,
  isAIWorkflowBlock,
  isContentBlock,
} from "@/lib/ai/layout/block-registry";
import type { LayoutIntent } from "@/lib/ai/layout/layout-types";
import { resolveLayout } from "@/lib/ai/layout/resolveLayout";
import type { SearchResult } from "@/types/slots";

const slot: SearchResult = {
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

function collectSystemActions(): SystemActionEvent[] {
  const events: SystemActionEvent[] = [];
  chatEvents.subscribe("system_action", (event) => {
    if (event.type === "system_action") events.push(event);
  });
  return events;
}

describe("Layout resolver and LayoutEngine boundary", () => {
  beforeEach(() => {
    jest.spyOn(console, "debug").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    bookingFlow.get().reset();
  });

  afterEach(() => {
    bookingFlow.get().reset();
    jest.restoreAllMocks();
  });

  it("resolveLayout sorts by priority", () => {
    const resolved = resolveLayout([
      { type: "CalendarBlock", priority: 4 },
      { type: "AuthBlock", priority: 1, metadata: { mode: "login" } },
    ]);

    expect(resolved.blocks.map((block) => block.type)).toEqual([
      "AuthBlock",
      "CalendarBlock",
    ]);
  });

  it("resolveLayout dedupes duplicate block type", () => {
    const resolved = resolveLayout([
      { type: "CalendarBlock", priority: 1 },
      { type: "CalendarBlock", priority: 2 },
    ]);

    expect(resolved.blocks).toHaveLength(1);
    expect(resolved.skipped).toContainEqual({
      type: "CalendarBlock",
      reason: "duplicate",
    });
  });

  it("resolveLayout preserves content block", () => {
    const resolved = resolveLayout([
      {
        type: "ArticleSectionBlock",
        priority: 1,
        metadata: {
          __legacyBlock: {
            id: "article-1",
            type: "ArticleSectionBlock",
            priority: 1,
            title: "Naslov",
            content: "Tekst",
          },
        },
      },
    ]);

    expect(resolved.blocks[0]).toMatchObject({
      type: "ArticleSectionBlock",
      title: "Naslov",
      content: "Tekst",
    });
  });

  it("resolveLayout skips unsupported block types", () => {
    const resolved = resolveLayout([
      { type: "UnknownBlock" as LayoutIntent["type"], priority: 1 },
      { type: "CalendarBlock", priority: 2 },
    ]);

    expect(resolved.blocks.map((block) => block.type)).toEqual(["CalendarBlock"]);
    expect(resolved.skipped).toContainEqual({
      type: "UnknownBlock",
      reason: "unsupported",
    });
  });

  it("resolveLayout preserves AI workflow block", () => {
    const resolved = resolveLayout([
      {
        type: "AuthBlock",
        priority: 1,
        metadata: { mode: "login" },
      },
    ]);

    expect(resolved.blocks).toEqual([
      expect.objectContaining({ type: "AuthBlock" }),
    ]);
  });

  it("AppointmentCalendarBlock with salonId/serviceId is not skipped by resolveLayout", () => {
    const resolved = resolveLayout([
      {
        type: "AppointmentCalendarBlock",
        priority: 1,
        metadata: {
          salonId: "beauty-m-glow",
          salonName: "Beauty M Glow",
          serviceId: "svc-madero",
          serviceName: "Maderoterapija",
          city: "Bor",
          date: "2026-05-28",
          timeWindowStart: 12,
          timeWindowEnd: null,
        },
      },
    ]);

    expect(resolved.blocks).toHaveLength(1);
    expect(resolved.skipped).toEqual([]);
  });

  it("two AppointmentCalendarBlock blocks with different salonId/serviceId are not duplicate", () => {
    const resolved = resolveLayout([
      {
        type: "AppointmentCalendarBlock",
        priority: 1,
        metadata: {
          salonId: "salon-1",
          serviceId: "service-1",
          serviceName: "Maderoterapija",
          city: "Bor",
          date: "2026-05-28",
          timeWindowStart: 12,
        },
      },
      {
        type: "AppointmentCalendarBlock",
        priority: 2,
        metadata: {
          salonId: "salon-2",
          serviceId: "service-2",
          serviceName: "Maderoterapija - Celo telo",
          city: "Bor",
          date: "2026-05-28",
          timeWindowStart: 12,
        },
      },
    ]);

    expect(resolved.blocks).toHaveLength(2);
  });

  it("LayoutEngine renders legacy layout through resolver", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/layout/LayoutEngine.tsx"),
      "utf8",
    );

    expect(source).toContain("resolveLayout(layoutIntents");
    expect(source).toContain("blockFactory(block");
  });

  it("LayoutEngine does not call AI automatically", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/layout/LayoutEngine.tsx"),
      "utf8",
    );

    expect(source).toContain("onClick={() =>");
    expect(source).toContain("onMessageAction(followUp)");
    expect(source).not.toContain("useEffect(() => {\n    onMessageAction");
  });

  it("duplicate block causes focus command rather than duplicate render", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/layout/LayoutEngine.tsx"),
      "utf8",
    );

    expect(source).toContain('type: "FOCUS_BLOCK"');
    expect(source).toContain('reason: "layout_duplicate_focus_existing"');
  });

  it("AppointmentCalendarBlock slot action emits SystemActionEvent", () => {
    const events = collectSystemActions();

    blockActionToSystemAction("AppointmentCalendarBlock", "slot_selected", {
      selectedSlot: slot,
    });

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "SLOT_SELECTED",
          visibleInThread: false,
          payload: expect.objectContaining({
            selectedSlot: slot,
            flowVersion: expect.any(Number),
          }),
        }),
      ]),
    );
  });

  it("LandingConfirmBlock routes modal intent through SystemActionEvent", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/blocks/LandingConfirmBlock.tsx"),
      "utf8",
    );

    expect(source).toContain("blockActionToSystemAction");
    expect(source).toContain('"slot_selected"');
    expect(source).not.toContain("openModal(");
  });

  it("CityListBlock action emits SystemActionEvent", () => {
    const events = collectSystemActions();

    blockActionToSystemAction("CityListBlock", "city_selected", {
      intent: "select_city",
      city: "Novi Sad",
      service: "Feniranje",
    });

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "CITY_SELECTED",
          visibleInThread: false,
          payload: expect.objectContaining({ city: "Novi Sad" }),
        }),
      ]),
    );
  });

  it("CITY_SELECTED does not render a user bubble through thread builder", () => {
    const items = createThreadItems("system_action:CITY_SELECTED", {
      messages: [{ id: "a-1", type: "text", role: "assistant", content: "Biramo grad." }],
      layout: [],
    });

    expect(items.some((item) => item.type === "message" && item.data.role === "user")).toBe(false);
  });

  it("SERVICE_SELECTED_FOR_SALON does not render a user bubble through thread builder", () => {
    const items = createThreadItems("system_action:SERVICE_SELECTED_FOR_SALON", {
      messages: [{ id: "a-1", type: "text", role: "assistant", content: "Biramo salon." }],
      layout: [],
    });

    expect(items.some((item) => item.type === "message" && item.data.role === "user")).toBe(false);
  });

  it("landing/content block fixtures are not touched or imported by resolver", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/ai/layout/resolveLayout.ts"),
      "utf8",
    );

    expect(source).not.toContain("ContentSplitBlockView");
    expect(source).not.toContain("HeroVisualBlockView");
  });

  it("blockFactory routes AI block through AI factory", () => {
    const block = {
      id: "auth-1",
      type: "AuthBlock",
      priority: 1,
      metadata: { serviceId: "", serviceName: "", variantName: "", mode: "login" },
    } as const;

    const routed = blockFactory(block);
    const direct = aiWorkflowBlockFactory(block);

    expect(routed?.type).toBe(direct?.type);
  });

  it("blockFactory renders AppointmentCalendarBlock for ai_workflow registry", () => {
    const block = {
      id: "appointment-1",
      type: "AppointmentCalendarBlock",
      priority: 1,
      metadata: {
        serviceId: "svc-madero",
        serviceName: "Maderoterapija",
        variantName: "",
        salonId: "beauty-m-glow",
        salonName: "Beauty M Glow",
        city: "Bor",
        date: "2026-05-28",
        timeWindowStart: 12,
      },
    } as const;

    const element = blockFactory(block);

    expect(element).toBeTruthy();
    expect(getBlockRegistryEntry("AppointmentCalendarBlock")?.kind).toBe("ai_workflow");
  });

  it("AppointmentCalendarBlock metadata survives Claudia legacy adapter", () => {
    const contract: ClaudiaContract = {
      kind: "booking_result",
      message: "Prikazujem termine.",
      workflow: { domain: "booking", step: "select_salon", status: "ready" },
      nextAction: { type: "SHOW_SLOTS", reason: "service_selected_for_salon" },
      ui: {
        blocks: [
          {
            type: "AppointmentCalendarBlock",
            priority: 1,
            metadata: {
              salonId: "beauty-m-glow",
              salonName: "Beauty M Glow",
              serviceId: "svc-madero",
              serviceName: "Maderoterapija",
              city: "Bor",
              date: "2026-05-28",
              timeWindowStart: 12,
              timeWindowEnd: null,
            },
          },
        ],
        hideBlocks: [],
        showBlocks: [],
      },
      intent: {
        type: "select_salon",
        confidence: 1,
        entities: {},
        missingFields: [],
      },
    };

    const legacy = claudiaContractToLegacyResponse(contract);

    expect(legacy.layout[0]).toMatchObject({
      type: "AppointmentCalendarBlock",
      metadata: {
        salonId: "beauty-m-glow",
        serviceId: "svc-madero",
        date: "2026-05-28",
        timeWindowStart: 12,
      },
    });
  });

  it("AppointmentCalendarBlockView does not return null when platform metadata exists", () => {
    const element = aiWorkflowBlockFactory({
      id: "appointment-1",
      type: "AppointmentCalendarBlock",
      priority: 1,
      metadata: {
        serviceId: "svc-madero",
        serviceName: "Maderoterapija",
        variantName: "",
        salonId: "beauty-m-glow",
        salonName: "Beauty M Glow",
        city: "Bor",
      },
    });

    expect(element).toBeTruthy();
  });

  it("missing salonId renders fallback recovery UI, not blank workspace", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/blocks/AppointmentCalendarBlockView.tsx"),
      "utf8",
    );

    expect(source).toContain("Nedostaju podaci za prikaz termina.");
    expect(source).toContain("BOOKING_PAYLOAD_INCOMPLETE");
    expect(source).not.toContain("if (services?.length === 0) return null");
  });

  it("SERVICE_SELECTED_FOR_SALON payload includes salonId serviceId date and timeWindow", () => {
    const events = collectSystemActions();

    blockActionToSystemAction("SalonListBlock", "service_selected_for_salon", {
      salonId: "beauty-m-glow",
      salonName: "Beauty M Glow",
      city: "Bor",
      serviceId: "svc-madero",
      serviceName: "Maderoterapija",
      date: "2026-05-28",
      timeWindowStart: 12,
      timeWindowEnd: null,
    });

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "SERVICE_SELECTED_FOR_SALON",
          payload: expect.objectContaining({
            salonId: "beauty-m-glow",
            serviceId: "svc-madero",
            date: "2026-05-28",
            timeWindowStart: 12,
            timeWindowEnd: null,
          }),
        }),
      ]),
    );
  });

  it("SERVICE_SELECTED_FOR_SALON displayMessage is sanitized and hides ids", () => {
    const event = blockActionToSystemAction("SalonListBlock", "service_selected_for_salon", {
      salonId: "beauty-m-glow-id",
      salonName: "Beauty M Glow",
      city: "Bor",
      serviceId: "svc-madero-secret",
      serviceName: "Maderoterapija",
      date: "2026-05-28",
      timeWindowStart: 12,
    });

    expect(event?.displayMessage).toBe("Izabrala si Beauty M Glow u Boru.");
    expect(event?.displayMessage).not.toContain("beauty-m-glow-id");
    expect(event?.displayMessage).not.toContain("svc-madero-secret");
  });

  it("stale CityListBlock click is ignored before it can restart flow", () => {
    const oldVersion = bookingFlow.get().flowVersion;
    bookingFlow.get().bumpFlowVersion("test_progressed");

    const event = sendSystemAction({
      action: "CITY_SELECTED",
      actionId: "old-city-click",
      source: "CalendarBlock",
      notifyAgent: true,
      visibleInThread: false,
      payload: {
        city: "Bor",
        service: "maderoterapija",
        flowVersion: oldVersion,
      },
    });

    expect(event).toBeNull();
    expect(console.debug).toHaveBeenCalledWith(
      "[STALE_BOOKING_ACTION_IGNORED]",
      expect.objectContaining({ action: "CITY_SELECTED" }),
    );
  });

  it("selection block views disable consumed and stale actions", () => {
    const citySource = readFileSync(
      path.join(process.cwd(), "src/components/blocks/CityListBlockView.tsx"),
      "utf8",
    );
    const salonSource = readFileSync(
      path.join(process.cwd(), "src/components/blocks/SalonListBlockView.tsx"),
      "utf8",
    );

    expect(citySource).toContain("[STALE_BLOCK_ACTION_IGNORED]");
    expect(citySource).toContain("disabled={disabled}");
    expect(citySource).not.toContain("Izabrao sam grad:");
    expect(salonSource).toContain("[STALE_BLOCK_ACTION_IGNORED]");
    expect(salonSource).toContain("disabled={disabled}");
    expect(salonSource).not.toContain("Izabrao sam salon:");
    expect(salonSource).not.toContain("[salonId:");
  });

  it("blockFactory routes content block through content factory", () => {
    const block = {
      id: "article-1",
      type: "ArticleSectionBlock",
      priority: 1,
      metadata: { serviceId: "", serviceName: "", variantName: "" },
      title: "Naslov",
      content: "Tekst",
    } as never;

    const routed = blockFactory(block);
    const direct = contentBlockFactory(block);

    expect(routed?.type).toBe(direct?.type);
  });

  it("content block does not receive workflow props", () => {
    const block = {
      id: "article-1",
      type: "ArticleSectionBlock",
      priority: 1,
      metadata: { serviceId: "", serviceName: "", variantName: "" },
      title: "Naslov",
      content: "Tekst",
    } as never;

    const element = contentBlockFactory(block);

    expect(element?.props).toEqual({
      block,
    });
    expect(element?.props.onActionComplete).toBeUndefined();
  });

  it("AI block can receive system action props", () => {
    const block = {
      id: "city-1",
      type: "CityListBlock",
      priority: 1,
      metadata: { serviceId: "", serviceName: "", variantName: "", service: "Feniranje" },
    } as const;

    const element = aiWorkflowBlockFactory(block, jest.fn());

    expect(element?.props.onActionComplete).toEqual(expect.any(Function));
  });

  it("resolveLayout is pure and deterministic", () => {
    const intents: LayoutIntent[] = [
      { type: "AuthBlock", priority: 2, metadata: { mode: "login" } },
      { type: "CalendarBlock", priority: 1 },
    ];
    const before = JSON.stringify(intents);

    expect(resolveLayout(intents)).toEqual(resolveLayout(intents));
    expect(JSON.stringify(intents)).toBe(before);
  });
});
  it("classifies AuthBlock as ai_workflow", () => {
    expect(isAIWorkflowBlock("AuthBlock")).toBe(true);
    expect(getBlockRegistryEntry("AuthBlock")).toMatchObject({
      kind: "ai_workflow",
      interactive: true,
    });
  });

  it("classifies AppointmentCalendarBlock as ai_workflow", () => {
    expect(isAIWorkflowBlock("AppointmentCalendarBlock")).toBe(true);
  });

  it("classifies CityListBlock as ai_workflow", () => {
    expect(isAIWorkflowBlock("CityListBlock")).toBe(true);
  });

  it("classifies HeroPrimaryBlock as content", () => {
    expect(isContentBlock("HeroPrimaryBlock")).toBe(true);
  });

  it("classifies ArticleSectionBlock as content", () => {
    expect(isContentBlock("ArticleSectionBlock")).toBe(true);
  });

  it("unknown block is unsupported", () => {
    expect(getBlockRegistryEntry("UnknownBlock")).toBeUndefined();
    expect(isAIWorkflowBlock("UnknownBlock")).toBe(false);
    expect(isContentBlock("UnknownBlock")).toBe(false);
  });

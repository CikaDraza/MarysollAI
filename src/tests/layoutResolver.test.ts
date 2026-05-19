import { readFileSync } from "fs";
import path from "path";
import { chatEvents } from "@/lib/ai/events/chatEvents";
import type { SystemActionEvent } from "@/lib/ai/events/chat-event-types";
import {
  aiWorkflowBlockFactory,
  blockFactory,
  contentBlockFactory,
} from "@/components/layout/blockFactory";
import { blockActionToSystemAction } from "@/lib/ai/layout/blockActionToSystemAction";
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
  });

  afterEach(() => {
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
          payload: { selectedSlot: slot },
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

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import CityListBlockView from "@/components/blocks/CityListBlockView";
import SalonListBlockView from "@/components/blocks/SalonListBlockView";
import { bookingFlow } from "@/lib/ai/booking-flow-state";
import {
  getBlockLifecycle,
  isBlockConsumed,
  markBlockConsumed,
  resetBlockLifecycle,
} from "@/lib/ai/layout/block-lifecycle";
import { sendSystemAction } from "@/lib/ai/events/systemActionDispatcher";
import { chatEvents } from "@/lib/ai/events/chatEvents";
import type { CityListBlockType, SalonListBlockType } from "@/types/landing-block";

function cityBlock(id = "city-block-1"): CityListBlockType {
  return {
    id,
    type: "CityListBlock",
    priority: 1,
    metadata: {
      serviceId: "",
      serviceName: "",
      variantName: "",
      service: "Maderoterapija",
      category: "massage",
      cities: [{ name: "Bor", salonCount: 1 }],
    },
  };
}

function salonBlock(id = "salon-block-1"): SalonListBlockType {
  return {
    id,
    type: "SalonListBlock",
    priority: 1,
    metadata: {
      serviceId: "",
      serviceName: "",
      variantName: "",
      city: "Bor",
      service: "Maderoterapija",
      salons: [{ id: "salon-1", name: "Beauty M Glow" }],
    },
  };
}

function renderWithQuery(node: React.ReactElement): string {
  const client = new QueryClient();
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
}

describe("block lifecycle", () => {
  beforeEach(() => {
    jest.spyOn(console, "debug").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    resetBlockLifecycle();
    bookingFlow.get().reset();
  });

  afterEach(() => {
    resetBlockLifecycle();
    bookingFlow.get().reset();
    jest.restoreAllMocks();
  });

  it("CITY_SELECTED consumes CityListBlock", () => {
    sendSystemAction({
      action: "CITY_SELECTED",
      source: "CalendarBlock",
      payload: {
        city: "Bor",
        sourceBlockId: "city-block-1",
        sourceBlockType: "CityListBlock",
      },
      visibleInThread: false,
    });

    expect(isBlockConsumed("city-block-1")).toBe(true);
    expect(getBlockLifecycle("city-block-1")).toMatchObject({
      blockType: "CityListBlock",
      state: "consumed",
      reason: "city_selected",
    });
  });

  it("SERVICE_SELECTED_FOR_SALON consumes SalonListBlock", () => {
    sendSystemAction({
      action: "SERVICE_SELECTED_FOR_SALON",
      source: "CalendarBlock",
      payload: {
        city: "Bor",
        serviceName: "Maderoterapija",
        salonName: "Beauty M Glow",
        sourceBlockId: "salon-block-1",
        sourceBlockType: "SalonListBlock",
      },
      visibleInThread: false,
    });

    expect(isBlockConsumed("salon-block-1")).toBe(true);
  });

  it("SLOT_SELECTED consumes AppointmentCalendarBlock", () => {
    sendSystemAction({
      action: "SLOT_SELECTED",
      source: "CalendarBlock",
      payload: {
        time: "15:00",
        salonName: "Beauty M Glow",
        sourceBlockId: "calendar-block-1",
        sourceBlockType: "AppointmentCalendarBlock",
      },
      visibleInThread: false,
    });

    expect(isBlockConsumed("calendar-block-1")).toBe(true);
  });

  it("clicking consumed CityListBlock emits no system action", () => {
    markBlockConsumed("city-block-1", "city_selected", "action-1", "CityListBlock");

    const event = sendSystemAction({
      action: "CITY_SELECTED",
      source: "CalendarBlock",
      payload: {
        city: "Bor",
        sourceBlockId: "city-block-1",
        sourceBlockType: "CityListBlock",
      },
      visibleInThread: false,
    });

    expect(event).toBeNull();
  });

  it("stale consumed block action is ignored in dispatcher", () => {
    markBlockConsumed("city-block-1", "city_selected", "action-1", "CityListBlock");

    const event = sendSystemAction({
      action: "CITY_SELECTED",
      source: "CalendarBlock",
      payload: {
        city: "Novi Sad",
        sourceBlockId: "city-block-1",
        sourceBlockType: "CityListBlock",
      },
      visibleInThread: false,
    });

    expect(event).toBeNull();
    expect(console.debug).toHaveBeenCalledWith(
      "[STALE_BLOCK_ACTION_IGNORED]",
      expect.objectContaining({ sourceBlockId: "city-block-1" }),
    );
  });

  it("stale action does not call Claudia through emitted system event", () => {
    const listener = jest.fn();
    const unsubscribe = chatEvents.subscribe("system_action", listener);
    markBlockConsumed("city-block-1", "city_selected", "action-1", "CityListBlock");

    sendSystemAction({
      action: "CITY_SELECTED",
      source: "CalendarBlock",
      payload: {
        city: "Novi Sad",
        sourceBlockId: "city-block-1",
        sourceBlockType: "CityListBlock",
      },
      visibleInThread: false,
    });

    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
  });

  it("stale action does not update bookingFlow", () => {
    markBlockConsumed("salon-block-1", "salon_selected", "action-1", "SalonListBlock");

    sendSystemAction({
      action: "SERVICE_SELECTED_FOR_SALON",
      source: "CalendarBlock",
      payload: {
        city: "Novi Sad",
        serviceName: "Feniranje",
        salonName: "Shi Sham",
        sourceBlockId: "salon-block-1",
        sourceBlockType: "SalonListBlock",
      },
      visibleInThread: false,
    });

    expect(bookingFlow.get().collected.serviceName).toBeUndefined();
    expect(bookingFlow.get().collected.salonName).toBeUndefined();
  });

  it("consumed CityListBlock renders disabled buttons", () => {
    markBlockConsumed("city-block-1", "city_selected", "action-1", "CityListBlock");

    const html = renderWithQuery(
      <CityListBlockView block={cityBlock()} onActionComplete={jest.fn()} />,
    );

    expect(html).toContain("disabled=\"\"");
  });

  it("consumed block shows Izabrano", () => {
    markBlockConsumed("salon-block-1", "salon_selected", "action-1", "SalonListBlock");

    const html = renderWithQuery(
      <SalonListBlockView block={salonBlock()} onActionComplete={jest.fn()} />,
    );

    expect(html).toContain("Izabrano");
  });

  it("fresh block action still works", () => {
    const event = sendSystemAction({
      action: "CITY_SELECTED",
      source: "CalendarBlock",
      payload: {
        city: "Bor",
        sourceBlockId: "fresh-city-block",
        sourceBlockType: "CityListBlock",
      },
      visibleInThread: false,
    });

    expect(event?.action).toBe("CITY_SELECTED");
    expect(isBlockConsumed("fresh-city-block")).toBe(true);
  });

  it("different blockId of same type remains active", () => {
    markBlockConsumed("city-block-1", "city_selected", "action-1", "CityListBlock");

    expect(isBlockConsumed("city-block-1")).toBe(true);
    expect(isBlockConsumed("city-block-2")).toBe(false);
  });

  it("resetBlockLifecycle clears consumed states", () => {
    markBlockConsumed("city-block-1", "city_selected", "action-1", "CityListBlock");

    resetBlockLifecycle();

    expect(isBlockConsumed("city-block-1")).toBe(false);
  });
});

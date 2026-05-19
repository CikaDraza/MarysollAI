import { sendSystemAction } from "@/lib/ai/events/systemActionDispatcher";
import type { SystemActionEvent } from "@/lib/ai/events/chat-event-types";
import type { BlockTypes } from "@/types/landing-block";

export function blockActionToSystemAction(
  blockType: BlockTypes,
  action: string,
  payload: Record<string, unknown> = {},
): SystemActionEvent | null {
  if (blockType === "AppointmentCalendarBlock" && action === "slot_selected") {
    return sendSystemAction({
      action: "SLOT_SELECTED",
      source: "CalendarBlock",
      payload,
      notifyAgent: false,
      visibleInThread: false,
    });
  }

  if (blockType === "CityListBlock" && action === "city_selected") {
    return sendSystemAction({
      action: "CITY_SELECTED",
      source: "CalendarBlock",
      payload,
      notifyAgent: true,
      visibleInThread: false,
    });
  }

  if (blockType === "SalonListBlock" && action === "salon_selected") {
    return sendSystemAction({
      action: "SALON_SELECTED",
      source: "CalendarBlock",
      payload,
      notifyAgent: true,
      visibleInThread: false,
    });
  }

  return null;
}

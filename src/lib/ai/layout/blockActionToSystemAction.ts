import { sendSystemAction } from "@/lib/ai/events/systemActionDispatcher";
import type { SystemActionEvent } from "@/lib/ai/events/chat-event-types";
import type { BlockTypes } from "@/types/landing-block";

function inCity(city: string): string {
  if (city === "Bor") return "Boru";
  if (city === "Novi Sad") return "Novom Sadu";
  if (city === "Beograd") return "Beogradu";
  return city;
}

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
      displayMessage: "Izabran je termin.",
      notifyAgent: false,
      visibleInThread: false,
    });
  }

  if (blockType === "CityListBlock" && action === "city_selected") {
    const city = typeof payload.city === "string" ? payload.city : "";
    return sendSystemAction({
      action: "CITY_SELECTED",
      source: "CalendarBlock",
      payload,
      displayMessage: city ? `Izabran je grad ${city}.` : "Izabran je grad.",
      notifyAgent: true,
      visibleInThread: false,
    });
  }

  if (blockType === "SalonListBlock" && action === "salon_selected") {
    const salonName = typeof payload.salonName === "string" ? payload.salonName : "";
    const city = typeof payload.city === "string" ? payload.city : "";
    return sendSystemAction({
      action: "SALON_SELECTED",
      source: "CalendarBlock",
      payload,
      displayMessage: salonName
        ? `Izabrala si ${salonName}${city ? ` u ${inCity(city)}` : ""}.`
        : "Izabran je salon.",
      notifyAgent: true,
      visibleInThread: false,
    });
  }

  if (blockType === "SalonListBlock" && action === "service_selected_for_salon") {
    const salonName = typeof payload.salonName === "string" ? payload.salonName : "";
    const city = typeof payload.city === "string" ? payload.city : "";
    return sendSystemAction({
      action: "SERVICE_SELECTED_FOR_SALON",
      source: "CalendarBlock",
      payload,
      displayMessage: salonName
        ? `Izabrala si ${salonName}${city ? ` u ${inCity(city)}` : ""}.`
        : "Izabran je salon.",
      notifyAgent: true,
      visibleInThread: false,
    });
  }

  return null;
}

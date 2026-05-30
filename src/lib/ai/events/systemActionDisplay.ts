import { sanitizeVisibleAgentMessage } from "@/lib/ai/communication/agent-communication-rules";
import type { SystemActionEvent } from "@/lib/ai/events/chat-event-types";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cityLocative(city: string): string {
  if (!city) return "";
  if (city === "Bor") return "Boru";
  if (city.endsWith("a")) return `${city.slice(0, -1)}i`;
  return city;
}

export function systemActionToDisplayMessage(
  event: SystemActionEvent,
): string | null {
  const payload = event.payload ?? {};
  const city = asString(payload.city);
  const salonName = asString(payload.salonName);
  const serviceName = asString(payload.serviceName) || asString(payload.service);
  const time =
    asString(payload.selectedTime) ||
    asString(payload.time) ||
    asString(payload.timeLabel);

  let message: string | null = null;

  if (event.action === "CITY_SELECTED" && city) {
    message = `Izabran je grad ${city}.`;
  }

  if (event.action === "SALON_SELECTED" && salonName) {
    message = city
      ? `Izabran je salon ${salonName} u ${cityLocative(city)}.`
      : `Izabran je salon ${salonName}.`;
  }

  if (event.action === "SERVICE_SELECTED_FOR_SALON" && serviceName && salonName) {
    message = `Izabrana je usluga ${serviceName} u salonu ${salonName}.`;
  }

  if (event.action === "SLOT_SELECTED" && time) {
    message = salonName
      ? `Izabran je termin ${time} u ${salonName}.`
      : `Izabran je termin ${time}.`;
  }

  if (event.action === "BOOKING_CONFLICT") {
    message =
      "Taj termin je u međuvremenu zauzet. Proveravam najbliže slobodne opcije.";
  }

  if (event.action === "LOGIN_SUCCESS") {
    message = "Uspešno ste prijavljeni.";
  }

  if (event.action === "BOOKING_SUBMIT_SUCCESS") {
    message = "Termin je poslat salonu na potvrdu.";
  }

  return message ? sanitizeVisibleAgentMessage(message, "claudia") : null;
}

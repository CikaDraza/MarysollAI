// app/api/ai/deepseek-conversation/route.ts
import {
  AgentCallEvent,
  AgentResponseEvent,
  AgentCompleteEvent,
} from "@/types/ai/deepseek/agent-call";
import type { IAppointment } from "@/types/appointments-type";
import type { ChatEvent as PhaseChatEvent } from "@/lib/ai/events/chat-event-types";

// lib/events/chatEvents.ts
type ChatEventType =
  | "CALL_AGENT"
  | "AGENT_RESPONSE"
  | "AGENT_COMPLETE"
  | "APPOINTMENT_CANCELLED"
  | "APPOINTMENT_UPDATED"
  | PhaseChatEvent["type"];
export interface AppointmentActionEvent {
  type: "APPOINTMENT_CANCELLED" | "APPOINTMENT_UPDATED";
  payload: {
    appointment?: IAppointment;
    appointmentId?: string;
    date?: string;
    time?: string;
  };
  timestamp: number;
}
export type ChatEvent =
  | AgentCallEvent
  | AgentResponseEvent
  | AgentCompleteEvent
  | AppointmentActionEvent
  | PhaseChatEvent;

export const isAgentCallEvent = (event: ChatEvent): event is AgentCallEvent =>
  event.type === "CALL_AGENT";

export const isAgentResponseEvent = (
  event: ChatEvent,
): event is AgentResponseEvent => event.type === "AGENT_RESPONSE";

export const isAgentCompleteEvent = (
  event: ChatEvent,
): event is AgentCompleteEvent => event.type === "AGENT_COMPLETE";

export const isAppointmentActionEvent = (
  event: ChatEvent,
): event is AppointmentActionEvent =>
  event.type === "APPOINTMENT_CANCELLED" || event.type === "APPOINTMENT_UPDATED";

type EventListener = (event: ChatEvent) => void;

class ChatEventBus {
  private listeners: Map<ChatEventType, Set<EventListener>> = new Map();
  private static instance: ChatEventBus;

  private constructor() {}

  static getInstance(): ChatEventBus {
    if (!ChatEventBus.instance) {
      ChatEventBus.instance = new ChatEventBus();
    }
    return ChatEventBus.instance;
  }

  subscribe(type: ChatEventType, listener: EventListener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);

    return () => {
      this.listeners.get(type)?.delete(listener);
    };
  }

  emit(event: ChatEvent): void {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      listeners.forEach((listener) => listener(event));
    }
  }
}

export const chatEvents = ChatEventBus.getInstance();

// app/api/ai/deepseek-conversation/route.ts
import {
  AgentCallEvent,
  AgentResponseEvent,
  AgentCompleteEvent,
} from "@/types/ai/deepseek/agent-call";

// lib/events/chatEvents.ts
type ChatEventType = "CALL_AGENT" | "AGENT_RESPONSE" | "AGENT_COMPLETE";
export type ChatEvent =
  | AgentCallEvent
  | AgentResponseEvent
  | AgentCompleteEvent;

export const isAgentCallEvent = (event: ChatEvent): event is AgentCallEvent =>
  event.type === "CALL_AGENT";

export const isAgentResponseEvent = (
  event: ChatEvent,
): event is AgentResponseEvent => event.type === "AGENT_RESPONSE";

export const isAgentCompleteEvent = (
  event: ChatEvent,
): event is AgentCompleteEvent => event.type === "AGENT_COMPLETE";

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

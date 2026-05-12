// types/ai/agent-call.ts
import { BlockTypes } from "@/types/landing-block";
import { Message as DeepSeekMessage } from "@/types/ai/deepseek";

export type AgentType =
  | "booking"
  | "auth"
  | "prices"
  | "appointments"
  | "testimonials";

export interface AgentCallMetadata {
  type: AgentType;
  originalMessage: string;
  userIntent: string;
  timestamp: number;
  payload?: Record<string, string>;
}

export interface AgentCallEvent {
  type: "CALL_AGENT";
  payload: {
    agentType: AgentCallMetadata["type"];
    userMessage: string;
    history: DeepSeekMessage[];
    sessionId?: string;
    handoffPayload?: Record<string, string>;
  };
  timestamp: number;
}

export interface AgentResponseEvent {
  type: "AGENT_RESPONSE";
  payload: {
    agentType: AgentType;
    content: string;
    completed: boolean;
    suggestedBlocks?: BlockTypes[]; // blokovi iz Gemini
  };
  timestamp: number;
}

export interface AgentCompleteEvent {
  type: "AGENT_COMPLETE";
  payload: {
    agentType: AgentType;
    summary: string;
    success: boolean;
  };
  timestamp: number;
}

export interface AgentCallBusEvent {
  type: "CALL_AGENT";
  payload: AgentCallEvent;
  timestamp: number;
}

export interface AgentResponseBusEvent {
  type: "AGENT_RESPONSE";
  payload: AgentResponseEvent;
  timestamp: number;
}

export interface AgentCompleteBusEvent {
  type: "AGENT_COMPLETE";
  payload: AgentCompleteEvent;
  timestamp: number;
}

export type ChatBusEvent =
  | AgentCallBusEvent
  | AgentResponseBusEvent
  | AgentCompleteBusEvent;

// Maria JSON route response — replaces text [CALL_AGENT:...] markers
export type MariaRouteResponse =
  | {
      type: "handoff";
      targetAgent: AgentType;
      reply: string;
      payload?: Record<string, string>;
    }
  | { type: "answer"; message: string };

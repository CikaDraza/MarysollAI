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
}

export interface AgentCallEvent {
  type: "CALL_AGENT";
  payload: {
    agentType: AgentCallMetadata["type"];
    userMessage: string;
    history: DeepSeekMessage[];
    sessionId?: string;
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

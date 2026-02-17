// types/ai/deepseek/api.ts

import { Message } from ".";

export interface DeepSeekDelta {
  content?: string;
  role?: string;
}

export interface DeepSeekChoice {
  delta: DeepSeekDelta;
  index: number;
  finish_reason: string | null;
}

export interface DeepSeekChunk {
  id: string;
  choices: DeepSeekChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    completion_tokens_details?: {
      reasoning_tokens: number;
    };
  };
  model: string;
  created: number;
  object: string;
}

export interface DeepSeekError {
  error?: {
    message: string;
    type?: string;
    param?: string;
    code?: string;
  };
}

export interface SendMessageRequest {
  messages: Pick<Message, "role" | "content">[];
}

export interface SendMessageResponse {
  id: string;
  choices: Array<{
    message: {
      role: "assistant";
      content: string;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

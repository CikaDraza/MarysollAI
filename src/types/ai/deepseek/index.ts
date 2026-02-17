// types/ai/deepseek/index.ts
export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Date;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
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

export interface ChatError {
  code: string;
  message: string;
  status?: number;
}

export interface StoredSession {
  id: string;
  title: string;
  messages: {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

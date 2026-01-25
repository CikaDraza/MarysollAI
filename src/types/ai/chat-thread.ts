import { BaseBlock } from "../landing-block";

export type ChatRole = "user" | "assistant";

export interface IMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
  attachToBlockType?: string;
}

export type ThreadItem =
  | { id: string; type: "message"; data: IMessage }
  | { id: string; type: "block"; data: BaseBlock };

export interface ChatThread {
  items: ThreadItem[];
}

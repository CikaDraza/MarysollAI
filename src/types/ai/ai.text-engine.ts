// src/types/ai/ai.text-engine.ts

import { BlockTypes } from "../landing-block";

export interface TextMessage {
  id: string;
  content: string;
  role: "user" | "assistant";
  attachToBlockType?: BlockTypes;
  type: string;
}

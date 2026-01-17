// src/types/ai/ai.text-engine.ts
import { BlockTypes } from "../block-types";

export interface TextMessage {
  id: string;
  content: string;
  attachToBlockType?: BlockTypes;
  type: string;
}

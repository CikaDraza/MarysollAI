// src/types/layout-suggestion.ts

import { BlockTypes } from "./landing-block";

export interface LayoutBlockSuggestion {
  type: BlockTypes;
  priority: number;
}

export interface LayoutSuggestionResponse {
  type: "layout_suggestion";
  intent: string;
  blocks: LayoutBlockSuggestion[];
}

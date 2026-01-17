// src/types/layout-suggestion.ts

import { BlockTypes } from "./block-types";

export interface LayoutBlockSuggestion {
  type: BlockTypes;
  priority: number;
}

export interface LayoutSuggestionResponse {
  type: "layout_suggestion";
  intent: string;
  blocks: LayoutBlockSuggestion[];
}

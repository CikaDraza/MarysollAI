// src/types/layout-suggestion.schema.ts

import { z } from "zod";

export const LayoutSuggestionSchema = z.object({
  type: z.literal("layout_suggestion"),
  intent: z.string(),
  blocks: z.array(
    z.object({
      type: z.string(),
      priority: z.number(),
    })
  ),
});

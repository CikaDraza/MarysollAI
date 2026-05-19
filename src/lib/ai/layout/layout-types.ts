import type { BaseBlock, BlockTypes } from "@/types/landing-block";

export type LayoutSurface = "workspace" | "drawer";

export interface LayoutIntent {
  id?: string;
  type: BlockTypes;
  priority?: number;
  metadata?: Record<string, unknown>;
  query?: string;
  surface?: LayoutSurface;
  source?: "ai" | "system" | "recovery" | "manual";
}

export interface ResolvedLayout {
  blocks: BaseBlock[];
  skipped: {
    type: string;
    reason: "duplicate" | "unsupported" | "invalid";
  }[];
}

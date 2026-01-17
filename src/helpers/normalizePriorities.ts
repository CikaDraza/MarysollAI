import { LandingBlock } from "@/types/landing-blocks";

export function normalizePriorities(layout: LandingBlock[]): LandingBlock[] {
  return layout.map((block, index) => ({
    ...block,
    priority: index,
  }));
}

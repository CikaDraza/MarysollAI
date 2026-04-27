import { SLUG_TO_CANONICAL, type CategorySlug } from "@/lib/intent/categoryMap";

export function getCategoryLabel(slug: string): string {
  return SLUG_TO_CANONICAL[slug as CategorySlug] ?? slug;
}

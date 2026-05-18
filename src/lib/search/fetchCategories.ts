import { unstable_cache } from "next/cache";
import { platformClient } from "@/lib/api/platformClient";
import type { PlatformCategory } from "@/types/category-types";

async function _fetchCategories(): Promise<PlatformCategory[]> {
  try {
    return await platformClient.getCategories();
  } catch {
    return [];
  }
}

// Batch 3 — shorter TTL + tag so the platform side can call
// revalidateTag("category-synonyms") when a salon adds/removes a service
// without waiting for the cache to expire.
export const fetchCategories = unstable_cache(
  _fetchCategories,
  ["platform-categories"],
  { revalidate: 300, tags: ["category-synonyms", "platform-categories"] },
);

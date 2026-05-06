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

export const fetchCategories = unstable_cache(
  _fetchCategories,
  ["platform-categories"],
  { revalidate: 3600 },
);

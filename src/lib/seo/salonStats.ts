// Cached, soft-failing server fetch of platform salon stats — for enriching SEO
// salon cards with rating. Returns null when the platform endpoint is missing or
// the tenant has no stats, so card rendering degrades gracefully.

import "server-only";
import { unstable_cache } from "next/cache";
import { platformClient } from "@/lib/api/platformClient";
import type { SalonStats } from "@/lib/salons/tenantStats";

async function _fetchSalonStats(tenantId: string): Promise<SalonStats | null> {
  try {
    return await platformClient.getSalonStats(tenantId);
  } catch {
    return null;
  }
}

export const fetchSalonStats = unstable_cache(_fetchSalonStats, ["seo-salon-stats"], {
  revalidate: 3600,
  tags: ["platform-salon-stats"],
});

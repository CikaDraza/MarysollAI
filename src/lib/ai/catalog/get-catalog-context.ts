// src/lib/ai/catalog/get-catalog-context.ts
//
// Server accessor za CatalogContext. Gradi leksikon iz platform knowledge-a
// (DB) i kešira ga po identitetu snapshot-a — fetchPlatformKnowledge je već
// keširan (unstable_cache, 5 min), pa se builder izvršava tek kada stigne
// svež snapshot.

import "server-only";
import { fetchPlatformKnowledge } from "@/lib/ai/platform-knowledge";
import {
  buildCatalogContext,
  catalogDataFromPlatformKnowledge,
  type CatalogContext,
} from "./catalog-context";

let cached: { source: unknown; context: CatalogContext } | null = null;

export async function getCatalogContext(): Promise<CatalogContext> {
  const platform = await fetchPlatformKnowledge();
  if (cached && cached.source === platform) return cached.context;
  const context = buildCatalogContext(
    catalogDataFromPlatformKnowledge(platform),
  );
  cached = { source: platform, context };
  return context;
}

/** Sinhronona varijanta za putanje koje već drže PlatformKnowledge u ruci. */
export function catalogContextFromPlatform(
  platform: Parameters<typeof catalogDataFromPlatformKnowledge>[0],
): CatalogContext {
  return buildCatalogContext(catalogDataFromPlatformKnowledge(platform));
}

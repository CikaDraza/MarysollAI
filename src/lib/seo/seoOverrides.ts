// Manual index/noindex override for individual SEO paths.
//
// Use this to force a page out of (or back into) the index when Google Search
// Console shows bad signals (thin content, soft-404, cannibalization), without
// touching the automatic content-threshold logic in `indexability.ts`.
//
// Precedence: an entry here ALWAYS wins over the automatic threshold decision.
// Keys are normalized pathnames WITHOUT trailing slash or query, e.g.
//   "/bor/frizura"  → force a category page
//   "/bor"          → force a city hub
//   "/salons/some-salon-slug" → force a salon profile
//
// Leave empty by default; add entries only when a specific page misbehaves.

export type IndexDirective = "index" | "noindex";

export const SEO_OVERRIDES: Record<string, IndexDirective> = {
  // "/bor/frizura": "noindex",
};

function normalizePath(path: string): string {
  const noQuery = path.split("?")[0].split("#")[0];
  if (noQuery.length > 1 && noQuery.endsWith("/")) {
    return noQuery.slice(0, -1);
  }
  return noQuery;
}

/** Returns the manual directive for a path, or undefined when none is set. */
export function getOverride(path: string): IndexDirective | undefined {
  return SEO_OVERRIDES[normalizePath(path)];
}

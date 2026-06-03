// POST /api/revalidate-marketplace
// Called by the platform on any marketplace-relevant write (new/approved/hidden
// salon, price/address/coordinate edit, added/removed service, city popularity
// change) so the booking app drops its caches immediately instead of waiting
// for the TTL. Authenticated with a shared secret.
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { invalidateCityCatalog, ensureCityCatalog } from "@/lib/cities-runtime";

// Tags that gate every platform-derived snapshot. They are defined on the
// unstable_cache wrappers in lib/ai/platform-knowledge, lib/search/fetchCategories
// and lib/search/fetchSearchPlatformData. The shared "platform-search" tag
// covers all three search caches (salon profiles, services, working hours).
const MARKETPLACE_CACHE_TAGS = [
  "platform-knowledge", // AI knowledge salon/service/city snapshot
  "category-synonyms", // AI categories + /api/search categories
  "platform-search", // /api/search salon profiles + services + working hours
] as const;

function isAuthorized(req: Request): boolean {
  const secret = process.env.BOOKING_REVALIDATE_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Drop the in-memory city catalog (so a brand-new city appears instantly)…
  invalidateCityCatalog();
  // …and bust the Next.js data-cache tags so AI knowledge and /api/search
  // rebuild from fresh platform data on the next request instead of serving a
  // stale snapshot for up to the TTL (which left a new salon invisible for days).
  // Next 16: revalidateTag requires a cache-life profile; "max" reproduces the
  // classic on-demand purge. (updateTag is Server-Action-only, not Route Handlers.)
  for (const tag of MARKETPLACE_CACHE_TAGS) revalidateTag(tag, "max");

  // Warm the city cache again so the next user request is fast.
  await ensureCityCatalog().catch(() => {});

  return NextResponse.json({ revalidated: true, tags: MARKETPLACE_CACHE_TAGS });
}

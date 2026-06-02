// POST /api/revalidate-marketplace
// Called by the platform when marketplace visibility / city popularity changes,
// so the booking app drops its city catalog cache immediately instead of
// waiting for the TTL. Authenticated with a shared secret.
import { NextResponse } from "next/server";
import { invalidateCityCatalog, ensureCityCatalog } from "@/lib/cities-runtime";

function isAuthorized(req: Request): boolean {
  const secret = process.env.BOOKING_REVALIDATE_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  invalidateCityCatalog();
  // Warm the cache again so the next user request is fast.
  await ensureCityCatalog().catch(() => {});

  return NextResponse.json({ revalidated: true });
}

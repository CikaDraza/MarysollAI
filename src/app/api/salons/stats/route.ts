import { NextResponse } from "next/server";
import { platformClient } from "@/lib/api/platformClient";

// Proxies the platform's public salon stats. Soft-fails to null when the
// platform endpoint isn't available yet (so the UI just hides those stats).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");

  if (!tenantId) {
    return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
  }

  try {
    const stats = await platformClient.getSalonStats(tenantId);
    return NextResponse.json(stats, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return NextResponse.json(null, { headers: { "Cache-Control": "no-store" } });
  }
}

/**
 * GET /api/debug/salon-raw
 *
 * Fetches raw SalonProfile + Services + Categories from platform and logs
 * the full unfiltered JSON to the server terminal for investigation.
 * Returns the same data as JSON so you can inspect in browser DevTools too.
 *
 * Usage: open http://localhost:3000/api/debug/salon-raw in browser.
 */
import { NextResponse } from "next/server";
import { platformClient } from "@/lib/api/platformClient";

export async function GET(): Promise<NextResponse> {
  // ── 1. Categories ──────────────────────────────────────────────────────────
  let categories: unknown[] = [];
  try {
    categories = await platformClient.getCategories();
  } catch (err) {
    console.error("[debug/salon-raw] categories error:", err);
  }

  // ── 2. All salons (no city filter) ─────────────────────────────────────────
  let salons: unknown[] = [];
  try {
    salons = await platformClient.getSalonProfiles({});
  } catch (err) {
    console.error("[debug/salon-raw] getSalonProfiles error:", err);
  }

  // ── 3. Services per salon ──────────────────────────────────────────────────
  const salonServices: Record<string, unknown> = {};
  const salonWorkingHours: Record<string, unknown> = {};

  for (const s of salons as Array<{ id?: string; _id?: string; name?: string }>) {
    const id = s.id ?? s._id ?? "";
    if (!id) continue;
    try {
      const svcs = await platformClient.getSalonServices(id);
      salonServices[id] = svcs;
    } catch (err) {
      salonServices[id] = { error: String(err) };
    }
    try {
      const wh = await platformClient.getSalonWorkingHours(id);
      salonWorkingHours[id] = wh;
    } catch (err) {
      salonWorkingHours[id] = { error: String(err) };
    }
  }

  // ── Server-side console dump ────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════");
  console.log("[debug/salon-raw] CATEGORIES (raw from platform):");
  console.log(JSON.stringify(categories, null, 2));

  console.log("\n[debug/salon-raw] SALON PROFILES (raw from platform, no filter):");
  for (const s of salons as Record<string, unknown>[]) {
    const id = (s.id ?? s._id ?? "?") as string;
    console.log(`\n  ── Salon: "${s.name}" (${id}) ──`);
    console.log("  ALL FIELDS:", JSON.stringify(s, null, 4));
  }

  console.log("\n[debug/salon-raw] SERVICES per salon (raw from /marketplace/services):");
  for (const [salonId, svcs] of Object.entries(salonServices)) {
    const salonName = (salons as Record<string, unknown>[]).find(
      (s) => (s.id ?? s._id) === salonId,
    )?.name ?? salonId;
    console.log(`\n  ── "${salonName}" (${salonId}) services:`);
    console.log("  ", JSON.stringify(svcs, null, 4));
  }

  console.log("\n[debug/salon-raw] WORKING HOURS per salon (raw from /marketplace/working-hours):");
  for (const [salonId, wh] of Object.entries(salonWorkingHours)) {
    const salonName = (salons as Record<string, unknown>[]).find(
      (s) => (s.id ?? s._id) === salonId,
    )?.name ?? salonId;
    console.log(`\n  ── "${salonName}" (${salonId}) workingHours:`);
    console.log("  ", JSON.stringify(wh, null, 4));
  }
  console.log("════════════════════════════════════════════════════════\n");

  return NextResponse.json(
    {
      categories,
      salons,
      salonServices,
      salonWorkingHours,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

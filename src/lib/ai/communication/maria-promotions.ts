// src/lib/ai/communication/maria-promotions.ts
//
// Real promotions for Maria. This read-only app has NO structured salon-discount
// dataset — the only genuine "promo/news" source is the editorial campaigns. So
// Maria may surface ONLY these; she must never invent a salon discount. Empty
// list → an honest "no active promotions" line (never a fabricated offer).

import { getPublishedCampaignTeasers } from "@/lib/editorial/getCampaignTeasers";

export interface MariaPromotion {
  title: string;
  /** Salon name for a tenant campaign, or "Marysoll" for a platform campaign. */
  source: string;
  href: string;
  isTenant: boolean;
}

const TTL_MS = 5 * 60 * 1000;
let cache: { at: number; promos: MariaPromotion[] } | null = null;
let inFlight: Promise<MariaPromotion[]> | null = null;

async function load(): Promise<MariaPromotion[]> {
  const teasers = await getPublishedCampaignTeasers();
  return (teasers ?? [])
    .filter((t) => t.audience !== "partner") // client-facing only
    .map((t) => ({
      title: t.title,
      source: t.sourceLabel,
      href: t.href,
      isTenant: t.hrefType === "tenant",
    }));
}

/**
 * Active client-facing promotions/campaigns. Cached for TTL_MS and
 * concurrency-safe so Maria doesn't re-query the DB on every message.
 * Soft-fails to an empty list.
 */
export async function getActivePromotions(): Promise<MariaPromotion[]> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.promos;
  if (inFlight) return inFlight;
  inFlight = load()
    .then((promos) => {
      cache = { at: Date.now(), promos };
      return promos;
    })
    .catch(() => cache?.promos ?? [])
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Compact, prompt-ready block. Empty list → honest "no promotions" line. */
export function formatPromotionsForPrompt(promos: MariaPromotion[]): string {
  if (!promos.length) {
    return "# AKTUELNE PROMOCIJE\nTrenutno nema aktivnih promocija.";
  }
  const lines = promos
    .slice(0, 6)
    .map((p) => {
      const where = p.isTenant && p.source ? ` — ${p.source}` : "";
      return `- "${p.title}"${where} · ${p.href}`;
    })
    .join("\n");
  return `# AKTUELNE PROMOCIJE\n${lines}`;
}

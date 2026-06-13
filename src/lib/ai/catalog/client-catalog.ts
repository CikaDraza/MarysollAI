// src/lib/ai/catalog/client-catalog.ts
//
// Klijentska hidracija intent leksikona. AgentEntryRouter je sinhron, pa
// katalog držimo u modulskom registru: `ensureClientCatalog()` se zove na
// mount-u chata, a `getClientCatalog()` vraća leksikon čim je učitan (do tada
// ruter koristi statične fallback regexe). Snapshot se kešira u localStorage
// sa TTL-om da refresh ne čeka mrežu.

import {
  buildCatalogContext,
  type CatalogContext,
  type CatalogData,
} from "./catalog-context";

const STORAGE_KEY = "marysoll_intent_catalog_v1";
const STORAGE_TTL_MS = 10 * 60 * 1000;

let activeCatalog: CatalogContext | null = null;
let inFlight: Promise<CatalogContext | null> | null = null;

export function getClientCatalog(): CatalogContext | null {
  return activeCatalog;
}

/** Test/SSR escape hatch — direktno postavljanje leksikona. */
export function setClientCatalog(data: CatalogData | null): void {
  activeCatalog = data ? buildCatalogContext(data) : null;
}

function readFromStorage(): CatalogData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: CatalogData };
    if (!parsed?.at || Date.now() - parsed.at > STORAGE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeToStorage(data: CatalogData): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ at: Date.now(), data }),
    );
  } catch {
    // localStorage pun/nedostupan — leksikon i dalje radi iz memorije.
  }
}

export async function ensureClientCatalog(): Promise<CatalogContext | null> {
  if (activeCatalog) return activeCatalog;
  if (inFlight) return inFlight;

  const stored = readFromStorage();
  if (stored) {
    activeCatalog = buildCatalogContext(stored);
    return activeCatalog;
  }

  inFlight = (async () => {
    try {
      const response = await fetch("/api/ai/catalog");
      if (!response.ok) return null;
      const data = (await response.json()) as CatalogData;
      if (!data?.cities) return null;
      writeToStorage(data);
      activeCatalog = buildCatalogContext(data);
      return activeCatalog;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

// src/lib/search/popularSearchCache.ts
//
// Phase 2.5A — Lightweight popularity cache + signal helpers.
//
// IMPORTANT — design decisions:
//   - In-memory cache only. NO heavy analytics infrastructure (per spec).
//   - Stale-while-revalidate: returns the cached value immediately, kicks off
//     a refresh in the background if older than `staleAfterMs`.
//   - Optional sessionStorage backing — survives within a session, doesn't
//     leak across days. localStorage is intentionally avoided to keep this
//     lightweight and respect the "session memory" constraint from Phase 1.
//   - Popularity signals are deterministic (no AI). They derive from
//     appointment counts / rating averages exposed by future platform
//     endpoints; until those exist, helpers return safe defaults so the
//     scoring engine treats them as neutral.
import { aiLog } from "@/lib/ai/debug-log";

const log = aiLog("SEARCH_ENGINE");

// ── Cache primitives ──────────────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  cachedAt: number;
}

interface CacheOptions {
  /** TTL in ms before the value is considered stale. */
  staleAfterMs?: number;
  /** Persist the value in sessionStorage so a refresh keeps it warm. */
  persist?: boolean;
}

const DEFAULT_STALE_MS = 5 * 60_000; // 5 min
const memCache = new Map<string, CacheEntry<unknown>>();

/** Read from session storage if persistence is enabled. Safe across SSR. */
function readSession<T>(key: string): CacheEntry<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`marysoll:cache:${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

function writeSession<T>(key: string, entry: CacheEntry<T>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      `marysoll:cache:${key}`,
      JSON.stringify(entry),
    );
  } catch {
    /* quota / privacy mode — silently skip */
  }
}

/**
 * Stale-while-revalidate cache. Returns the cached value (if any) immediately,
 * then revalidates in background when older than `staleAfterMs`.
 *
 * USAGE:
 *   const popular = await cachedFetch(
 *     "popular_services",
 *     () => fetch("/api/popular/services").then(r => r.json()),
 *     { staleAfterMs: 5 * 60_000, persist: true },
 *   );
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: CacheOptions = {},
): Promise<T> {
  const staleAfterMs = opts.staleAfterMs ?? DEFAULT_STALE_MS;
  const now = Date.now();

  // Tier 1: in-memory.
  const memEntry = memCache.get(key) as CacheEntry<T> | undefined;
  if (memEntry) {
    const age = now - memEntry.cachedAt;
    if (age < staleAfterMs) {
      log("cache.hit", { key, age });
      return memEntry.value;
    }
    // Stale — revalidate in background, return stale value now.
    log("cache.stale", { key, age });
    revalidate(key, fetcher, opts);
    return memEntry.value;
  }

  // Tier 2: sessionStorage (cold start, but session-warm).
  if (opts.persist) {
    const sessionEntry = readSession<T>(key);
    if (sessionEntry) {
      memCache.set(key, sessionEntry);
      const age = now - sessionEntry.cachedAt;
      if (age >= staleAfterMs) revalidate(key, fetcher, opts);
      log("cache.session_hit", { key, age });
      return sessionEntry.value;
    }
  }

  // Cold miss: fetch synchronously.
  log("cache.miss", { key });
  return revalidate(key, fetcher, opts);
}

async function revalidate<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: CacheOptions,
): Promise<T> {
  const value = await fetcher();
  const entry: CacheEntry<T> = { value, cachedAt: Date.now() };
  memCache.set(key, entry);
  if (opts.persist) writeSession(key, entry);
  return value;
}

/** Imperative cache invalidation. Used by tests + admin actions. */
export function clearPopularCache(key?: string): void {
  if (key) {
    memCache.delete(key);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(`marysoll:cache:${key}`);
    }
  } else {
    memCache.clear();
  }
  log("cache.cleared", { key: key ?? "all" });
}

// ── Popularity signal helpers ─────────────────────────────────────────────────
//
// These return values in [0, 1] (matching SlotScoreInput contract). Until the
// platform exposes the underlying counters, helpers return undefined which
// `calculateSlotScore` treats as neutral (0.5). When platform data lands, only
// these functions need to be updated — the scoring engine + ranking adapter
// stay untouched.

export interface PopularityIndex {
  /** Map of serviceId → 0..1 popularity score. */
  services: Record<string, number>;
  /** Map of salonId → 0..1 popularity score. */
  salons: Record<string, number>;
  /** Recent search terms in canonical form, sorted by frequency desc. */
  trending: string[];
}

const EMPTY_INDEX: PopularityIndex = {
  services: {},
  salons: {},
  trending: [],
};

/**
 * Look up service popularity from the cached index. Returns undefined when
 * the index hasn't been hydrated yet or the serviceId is unknown — caller
 * (slot scoring) treats undefined as neutral.
 */
export function getServicePopularity(
  index: PopularityIndex | undefined,
  serviceId: string | null | undefined,
): number | undefined {
  if (!index || !serviceId) return undefined;
  const v = index.services[serviceId];
  return typeof v === "number" ? v : undefined;
}

export function getSalonPopularity(
  index: PopularityIndex | undefined,
  salonId: string | undefined,
): number | undefined {
  if (!index || !salonId) return undefined;
  const v = index.salons[salonId];
  return typeof v === "number" ? v : undefined;
}

/**
 * Trending search terms — what users are typing across the platform recently.
 * Used by the homepage preload + recovery suggestions ("Pokušaj: šišanje
 * danas u Beogradu").
 */
export function getTrendingSearches(
  index: PopularityIndex | undefined,
  limit = 5,
): string[] {
  if (!index) return [];
  return index.trending.slice(0, limit);
}

/**
 * Convenience getter that returns the full PopularityIndex from cache,
 * or EMPTY_INDEX if it hasn't been hydrated yet. Never throws.
 */
export async function getPopularityIndex(
  fetcher: () => Promise<PopularityIndex>,
): Promise<PopularityIndex> {
  try {
    return await cachedFetch("popularity_index", fetcher, {
      staleAfterMs: 10 * 60_000,
      persist: true,
    });
  } catch (err) {
    log("popularity.fetch_failed", { error: String(err) });
    return EMPTY_INDEX;
  }
}

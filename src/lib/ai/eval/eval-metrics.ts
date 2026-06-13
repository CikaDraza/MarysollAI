// src/lib/ai/eval/eval-metrics.ts
//
// Faza 8 — čiste (bez I/O, bez mreže) metrike za poređenje modela. Sve je
// determinističko i unit-testabilno; harness ih samo sabira preko rezultata.
//
// Kriterijumi (zahtev korisnika): razume booking intent, drži kontekst, prati
// JSON contract, ne halucinira. Eval se vodi nad ruter-kontraktom (Maria
// MariaContract oblik) — pokriva intent, JSON i halucinacije uniformno.

import type { LlmUsage } from "./llm-adapter";

/** Self-contained normalizer (no `@/` alias → harness runs under tsx without
 * tsconfig path resolution). Mirrors normalizeCatalogText. */
function normalizeCatalogText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "dj")
    .replace(/\s+/g, " ")
    .trim();
}

export interface AgentContract {
  kind?: string;
  message?: string;
  intent?: {
    domain?: string;
    action?: string;
    entities?: { city?: string | null; service?: string | null } & Record<
      string,
      unknown
    >;
  };
  routing?: { shouldHandoff?: boolean; targetAgent?: string };
}

export interface GoldenExpectation {
  domain?: string;
  action?: string;
  shouldHandoff?: boolean;
  city?: string;
  service?: string;
  /** Nepostojeći grad/usluga: model NE sme da odluta u booking kao da postoji. */
  mustNotInvent?: boolean;
}

export interface CaseScore {
  jsonValid: boolean;
  intentMatch: boolean;
  handoffMatch: boolean;
  entityMatch: boolean;
  hallucinated: boolean;
}

/** Tolerant parse: strips code fences and any prose around the JSON object,
 * mirrors what the production parsers accept. Returns null on failure. */
export function parseAgentContract(text: string): AgentContract | null {
  if (!text || !text.trim()) return null;
  let s = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const open = s.indexOf("{");
  const close = s.lastIndexOf("}");
  if (open >= 0 && close > open) s = s.slice(open, close + 1);
  try {
    const obj = JSON.parse(s);
    return obj && typeof obj === "object" ? (obj as AgentContract) : null;
  } catch {
    return null;
  }
}

function eq(a: string | undefined | null, b: string | undefined): boolean {
  if (!b) return true; // not asserted
  return normalizeCatalogText(String(a ?? "")) === normalizeCatalogText(b);
}

function serviceMatch(
  actual: string | undefined | null,
  expected: string | undefined,
): boolean {
  if (!expected) return true;
  const a = normalizeCatalogText(String(actual ?? ""));
  const e = normalizeCatalogText(expected);
  if (!a) return false;
  return a === e || a.includes(e) || e.includes(a);
}

export function scoreCase(
  parsed: AgentContract | null,
  expect: GoldenExpectation,
): CaseScore {
  if (!parsed || !parsed.intent) {
    return {
      jsonValid: false,
      intentMatch: false,
      handoffMatch: false,
      entityMatch: false,
      hallucinated: false,
    };
  }
  const intentMatch =
    eq(parsed.intent.domain, expect.domain) &&
    eq(parsed.intent.action, expect.action);
  const handoffMatch =
    expect.shouldHandoff === undefined
      ? true
      : Boolean(parsed.routing?.shouldHandoff) === expect.shouldHandoff;
  const entityMatch =
    eq(parsed.intent.entities?.city, expect.city) &&
    serviceMatch(parsed.intent.entities?.service, expect.service);
  // Halucinacija: za nepostojeći grad/uslugu, ispravno je NE predati booking-u
  // kao da je dostupno. Ako model svejedno ruta na handoff → izmislio je.
  const hallucinated =
    expect.mustNotInvent === true && parsed.routing?.shouldHandoff === true;
  return { jsonValid: true, intentMatch, handoffMatch, entityMatch, hallucinated };
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

export function costUsd(
  usage: LlmUsage,
  price: { input: number; output: number } | undefined,
): number | null {
  if (!price) return null;
  // Cache-read tokens (Anthropic/OpenAI) bill at ~0.1x input; the rest at full.
  const cached = usage.cacheReadTokens ?? 0;
  const freshInput = Math.max(0, usage.inputTokens - cached);
  return (
    (freshInput * price.input +
      cached * price.input * 0.1 +
      usage.outputTokens * price.output) /
    1_000_000
  );
}

export interface ModelRunRow {
  score: CaseScore;
  latencyMs: number;
  usage: LlmUsage;
  costUsd: number | null;
  error?: string;
}

export interface ModelSummary {
  total: number;
  errors: number;
  validJsonPct: number;
  intentAccuracyPct: number;
  handoffAccuracyPct: number;
  entityAccuracyPct: number;
  hallucinationRatePct: number;
  latencyP50: number;
  latencyP95: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number | null;
}

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 1000) / 10;
}

export function summarize(rows: ModelRunRow[]): ModelSummary {
  const total = rows.length;
  const ok = rows.filter((r) => !r.error);
  const valid = ok.filter((r) => r.score.jsonValid);
  const latencies = ok.map((r) => r.latencyMs);
  const anyCost = rows.some((r) => r.costUsd != null);
  return {
    total,
    errors: rows.filter((r) => r.error).length,
    validJsonPct: pct(valid.length, total),
    // Accuracy denominators use valid-JSON rows — a broken JSON can't have a
    // correct intent, and lumping the two hides which dimension failed.
    intentAccuracyPct: pct(
      valid.filter((r) => r.score.intentMatch).length,
      valid.length,
    ),
    handoffAccuracyPct: pct(
      valid.filter((r) => r.score.handoffMatch).length,
      valid.length,
    ),
    entityAccuracyPct: pct(
      valid.filter((r) => r.score.entityMatch).length,
      valid.length,
    ),
    hallucinationRatePct: pct(
      valid.filter((r) => r.score.hallucinated).length,
      valid.length,
    ),
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
    totalInputTokens: rows.reduce((s, r) => s + r.usage.inputTokens, 0),
    totalOutputTokens: rows.reduce((s, r) => s + r.usage.outputTokens, 0),
    totalCostUsd: anyCost
      ? rows.reduce((s, r) => s + (r.costUsd ?? 0), 0)
      : null,
  };
}

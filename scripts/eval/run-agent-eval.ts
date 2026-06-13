// scripts/eval/run-agent-eval.ts
//
// Faza 8 — A/B test modela (DeepSeek vs Claude Sonnet 4.6 vs GPT 5.5).
// Pokreće golden dataset kroz sve dostupne adaptere i piše md izveštaj.
//
// Pokretanje (potrebni ključevi u env-u; nedostajući provajder se preskače):
//   ANTHROPIC_MARIA_CLAUDIA_API_KEY=...  \
//   OPENAI_MARIA_CLAUDIA_API_KEY=...     \
//   DEEPSEEK_API_KEY_SYSTEM=...          \
//   npm run eval:agents
//
// Opcije (env): EVAL_PROVIDERS=deepseek,anthropic (default: svi sa ključem)
//   EVAL_STRUCTURED=1  → uključi provajdersko JSON forsiranje (8.2 demo)
//   OPENAI_MARIA_CLAUDIA_PRICE_IN / _OUT  → cena GPT-a (USD/MTok) za trošak
//
// NAPOMENA: mreža + plaća se. Nije deo jest suite-a — pokreće se ručno.

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

// Učitaj .env.local (Next ga drži ovde) u process.env — standalone tsx skripta
// ga ne učitava sama. Ručni parser (ne pregazi već postavljen env; ne ispisuje
// vrednosti).
function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;
  for (const rawLine of readFileSync(file, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const withoutExport = line.startsWith("export ")
      ? line.slice(7).trim()
      : line;
    const eq = withoutExport.indexOf("=");
    if (eq <= 0) continue;
    const key = withoutExport.slice(0, eq).trim();
    let value = withoutExport.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

for (const f of [".env.local", ".env"]) {
  loadEnvFile(join(process.cwd(), f));
}
import {
  adapterFromEnv,
  MODEL_PRICE_USD_PER_MTOK,
  type LlmAdapter,
  type LlmProvider,
} from "../../src/lib/ai/eval/llm-adapter";
import {
  costUsd,
  parseAgentContract,
  scoreCase,
  summarize,
  type ModelRunRow,
  type ModelSummary,
} from "../../src/lib/ai/eval/eval-metrics";
import {
  buildEvalSystemPrompt,
  GOLDEN_CASES,
} from "../../src/lib/ai/eval/golden-dataset";

const ALL_PROVIDERS: LlmProvider[] = ["deepseek", "anthropic", "openai"];

function priceFor(provider: LlmProvider, model: string) {
  if (MODEL_PRICE_USD_PER_MTOK[model]) return MODEL_PRICE_USD_PER_MTOK[model];
  if (provider === "openai") {
    const input = Number(process.env.OPENAI_MARIA_CLAUDIA_PRICE_IN);
    const output = Number(process.env.OPENAI_MARIA_CLAUDIA_PRICE_OUT);
    if (Number.isFinite(input) && Number.isFinite(output)) {
      return { input, output };
    }
  }
  return undefined;
}

async function runProvider(
  adapter: LlmAdapter,
  useStructured: boolean,
): Promise<{ rows: ModelRunRow[]; summary: ModelSummary }> {
  const system = buildEvalSystemPrompt();
  const price = priceFor(adapter.provider, adapter.model);
  const rows: ModelRunRow[] = [];

  for (const testCase of GOLDEN_CASES) {
    const messages = [
      ...(testCase.context ?? []),
      { role: "user" as const, content: testCase.message },
    ];
    try {
      const result = await adapter.complete({
        system,
        messages,
        jsonObjectMode:
          useStructured && adapter.provider !== "anthropic" ? true : undefined,
      });
      const parsed = parseAgentContract(result.text);
      rows.push({
        score: scoreCase(parsed, testCase.expect),
        latencyMs: result.latencyMs,
        usage: result.usage,
        costUsd: costUsd(result.usage, price),
      });
    } catch (error) {
      rows.push({
        score: {
          jsonValid: false,
          intentMatch: false,
          handoffMatch: false,
          entityMatch: false,
          hallucinated: false,
        },
        latencyMs: 0,
        usage: { inputTokens: 0, outputTokens: 0 },
        costUsd: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { rows, summary: summarize(rows) };
}

function fmtCost(v: number | null): string {
  return v == null ? "n/a" : `$${v.toFixed(4)}`;
}

function buildReport(
  entries: Array<{ adapter: LlmAdapter; summary: ModelSummary }>,
): string {
  const header =
    "| Model | Provider | JSON valid | Intent | Handoff | Entity | Halucinacije | p50 ms | p95 ms | Tokeni (in/out) | Cena |\n" +
    "|---|---|---|---|---|---|---|---|---|---|---|";
  const rows = entries.map(({ adapter, summary: s }) => {
    return `| ${adapter.model} | ${adapter.provider} | ${s.validJsonPct}% | ${s.intentAccuracyPct}% | ${s.handoffAccuracyPct}% | ${s.entityAccuracyPct}% | ${s.hallucinationRatePct}% | ${s.latencyP50} | ${s.latencyP95} | ${s.totalInputTokens}/${s.totalOutputTokens} | ${fmtCost(s.totalCostUsd)} |`;
  });
  const errors = entries
    .filter((e) => e.summary.errors > 0)
    .map((e) => `- ${e.adapter.model}: ${e.summary.errors} grešaka`)
    .join("\n");
  return [
    "# Agent model A/B eval",
    "",
    `Datum: ${new Date().toISOString()}`,
    `Scenarija: ${GOLDEN_CASES.length}`,
    "",
    header,
    ...rows,
    "",
    "Kriterijumi: razume booking intent (Intent), drži kontekst (multi-turn slučajevi), prati JSON contract (JSON valid), ne halucinira (Halucinacije — niže je bolje).",
    errors ? `\n## Greške\n${errors}` : "",
  ].join("\n");
}

async function main(): Promise<void> {
  const requested = (process.env.EVAL_PROVIDERS ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean) as LlmProvider[];
  const providers = requested.length > 0 ? requested : ALL_PROVIDERS;
  const useStructured = process.env.EVAL_STRUCTURED === "1";

  const entries: Array<{ adapter: LlmAdapter; summary: ModelSummary }> = [];
  for (const provider of providers) {
    const adapter = adapterFromEnv(provider);
    if (!adapter) {
      console.warn(`[eval] preskačem ${provider} — nema API ključa u env-u`);
      continue;
    }
    console.log(`[eval] ${provider} (${adapter.model}) — ${GOLDEN_CASES.length} scenarija…`);
    const { summary } = await runProvider(adapter, useStructured);
    entries.push({ adapter, summary });
    console.log(
      `[eval]   JSON ${summary.validJsonPct}% · intent ${summary.intentAccuracyPct}% · halucinacije ${summary.hallucinationRatePct}% · p50 ${summary.latencyP50}ms`,
    );
  }

  if (entries.length === 0) {
    console.error(
      "[eval] nijedan provajder nije dostupan. Postavi bar jedan API ključ.",
    );
    process.exit(1);
  }

  const report = buildReport(entries);
  const outPath = join(process.cwd(), "scripts/eval/agent-eval-report.md");
  writeFileSync(outPath, report + "\n");
  console.log(`\n${report}\n\n[eval] izveštaj zapisan: ${outPath}`);
}

void main();

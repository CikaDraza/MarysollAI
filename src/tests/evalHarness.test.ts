// src/tests/evalHarness.test.ts
//
// Faza 8 — A/B eval harness. Unit-testira čiste delove (parser, metrike, cena,
// agregacija) i adapter factory env wiring (bez mreže — samo konstrukcija).

import {
  parseAgentContract,
  scoreCase,
  percentile,
  costUsd,
  summarize,
  type ModelRunRow,
} from "@/lib/ai/eval/eval-metrics";
import {
  adapterFromEnv,
  createAdapter,
  MODEL_PRICE_USD_PER_MTOK,
} from "@/lib/ai/eval/llm-adapter";
import {
  GOLDEN_CASES,
  buildEvalSystemPrompt,
  EVAL_CATALOG,
} from "@/lib/ai/eval/golden-dataset";

describe("parseAgentContract", () => {
  it("parsira čist JSON", () => {
    const c = parseAgentContract('{"intent":{"domain":"booking"}}');
    expect(c?.intent?.domain).toBe("booking");
  });
  it("skida ```json ograde i okolni tekst", () => {
    const c = parseAgentContract(
      'Evo odgovora:\n```json\n{"intent":{"domain":"prices"}}\n```',
    );
    expect(c?.intent?.domain).toBe("prices");
  });
  it("nevalidan → null", () => {
    expect(parseAgentContract("nije json")).toBeNull();
    expect(parseAgentContract("")).toBeNull();
  });
});

describe("scoreCase", () => {
  const booking = {
    kind: "intent",
    intent: {
      domain: "booking",
      action: "search_slots",
      entities: { city: "Beograd", service: "masaža" },
    },
    routing: { shouldHandoff: true, targetAgent: "claudia" },
  };

  it("tačan booking handoff → sve tačno, bez halucinacije", () => {
    const s = scoreCase(booking, {
      domain: "booking",
      action: "search_slots",
      shouldHandoff: true,
      city: "Beograd",
      service: "masaža",
    });
    expect(s).toEqual({
      jsonValid: true,
      intentMatch: true,
      handoffMatch: true,
      entityMatch: true,
      hallucinated: false,
    });
  });

  it("entitet se poredi bez dijakritika i registra", () => {
    const s = scoreCase(
      { intent: { entities: { city: "beograd" } }, routing: {} },
      { city: "Beograd" },
    );
    expect(s.entityMatch).toBe(true);
  });

  it("nevalidan JSON → jsonValid false, ostalo false", () => {
    const s = scoreCase(null, { domain: "booking" });
    expect(s.jsonValid).toBe(false);
    expect(s.intentMatch).toBe(false);
  });

  it("mustNotInvent + handoff true → halucinacija", () => {
    const s = scoreCase(
      { intent: { domain: "booking" }, routing: { shouldHandoff: true } },
      { mustNotInvent: true, shouldHandoff: false },
    );
    expect(s.hallucinated).toBe(true);
    expect(s.handoffMatch).toBe(false);
  });

  it("mustNotInvent + handoff false → bez halucinacije", () => {
    const s = scoreCase(
      { intent: { domain: "faq" }, routing: { shouldHandoff: false } },
      { mustNotInvent: true, shouldHandoff: false },
    );
    expect(s.hallucinated).toBe(false);
    expect(s.handoffMatch).toBe(true);
  });
});

describe("percentile + costUsd + summarize", () => {
  it("percentile", () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
    expect(percentile([10, 20, 30, 40], 95)).toBe(40);
    expect(percentile([], 50)).toBe(0);
  });

  it("costUsd: Sonnet 4.6 cena, cache-read na 0.1x", () => {
    const price = MODEL_PRICE_USD_PER_MTOK["claude-sonnet-4-6"];
    // 1M sveži input @ $3 + 1M output @ $15 = $18
    expect(
      costUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, price),
    ).toBeCloseTo(18, 5);
    // 1M input od kojih 500k iz keša: 500k@3 + 500k@0.3 = $1.65
    expect(
      costUsd(
        { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 500_000 },
        price,
      ),
    ).toBeCloseTo(1.65, 5);
  });

  it("costUsd bez cene → null", () => {
    expect(
      costUsd({ inputTokens: 10, outputTokens: 10 }, undefined),
    ).toBeNull();
  });

  it("summarize agregira nad valid-JSON redovima", () => {
    const rows: ModelRunRow[] = [
      {
        score: {
          jsonValid: true,
          intentMatch: true,
          handoffMatch: true,
          entityMatch: true,
          hallucinated: false,
        },
        latencyMs: 100,
        usage: { inputTokens: 100, outputTokens: 50 },
        costUsd: 0.001,
      },
      {
        score: {
          jsonValid: true,
          intentMatch: false,
          handoffMatch: true,
          entityMatch: true,
          hallucinated: true,
        },
        latencyMs: 300,
        usage: { inputTokens: 100, outputTokens: 50 },
        costUsd: 0.001,
      },
      {
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
        error: "boom",
      },
    ];
    const s = summarize(rows);
    expect(s.total).toBe(3);
    expect(s.errors).toBe(1);
    expect(s.validJsonPct).toBe(66.7); // 2/3
    expect(s.intentAccuracyPct).toBe(50); // 1/2 valid
    expect(s.hallucinationRatePct).toBe(50);
    expect(s.latencyP50).toBeGreaterThan(0);
    expect(s.totalCostUsd).toBeCloseTo(0.002, 6);
  });
});

describe("adapterFromEnv — env wiring (bez mreže)", () => {
  it("bez ključa → null", () => {
    expect(adapterFromEnv("anthropic", {} as NodeJS.ProcessEnv)).toBeNull();
    expect(adapterFromEnv("openai", {} as NodeJS.ProcessEnv)).toBeNull();
    expect(adapterFromEnv("deepseek", {} as NodeJS.ProcessEnv)).toBeNull();
  });

  it("Anthropic ključ (sa crticom) → Sonnet 4.6", () => {
    const a = adapterFromEnv("anthropic", {
      ANTHROPIC_MARIA_CLAUDIA_API_KEY: "sk-ant-x",
    } as unknown as NodeJS.ProcessEnv);
    expect(a?.provider).toBe("anthropic");
    expect(a?.model).toBe("claude-sonnet-4-6");
  });

  it("OpenAI ključ (sa crticom) → GPT 5.5 default", () => {
    const a = adapterFromEnv("openai", {
      OPENAI_MARIA_CLAUDIA_API_KEY: "sk-x",
    } as unknown as NodeJS.ProcessEnv);
    expect(a?.provider).toBe("openai");
    expect(a?.model).toBe("gpt-5.5");
  });

  it("DeepSeek koristi postojeće env varijable, nepromenjeno", () => {
    const a = adapterFromEnv("deepseek", {
      DEEPSEEK_API_KEY_SYSTEM: "ds-x",
    } as unknown as NodeJS.ProcessEnv);
    expect(a?.provider).toBe("deepseek");
    expect(a?.model).toBe("deepseek-chat");
  });

  it("createAdapter poštuje override modela", () => {
    const a = createAdapter("anthropic", {
      apiKey: "k",
      model: "claude-haiku-4-5",
    });
    expect(a.model).toBe("claude-haiku-4-5");
  });
});

describe("golden dataset", () => {
  it("ima scenarije i pokriva ključne kategorije", () => {
    expect(GOLDEN_CASES.length).toBeGreaterThanOrEqual(15);
    const ids = GOLDEN_CASES.map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "booking-city-service",
        "correction-city",
        "hallucination-city",
        "context-followup-city",
      ]),
    );
    // halucinacijski slučajevi su označeni
    expect(GOLDEN_CASES.some((c) => c.expect.mustNotInvent)).toBe(true);
  });

  it("eval system prompt sadrži katalog gradova i instrukciju protiv halucinacija", () => {
    const p = buildEvalSystemPrompt();
    for (const city of EVAL_CATALOG.cities) expect(p).toContain(city);
    expect(p).toContain("NE postoje");
  });
});

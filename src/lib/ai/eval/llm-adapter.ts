// src/lib/ai/eval/llm-adapter.ts
//
// Faza 8 — A/B test modela. Jedinstveni interfejs preko tri provajdera tako da
// eval harness (i, kasnije, produkcija) menja model bez izmene poziva.
//
//   DeepSeek  — openai-compatible klijent (kao u produkciji, ne menja se)
//   Anthropic — Claude Sonnet 4.6 preko Messages API (raw fetch, isti obrazac
//               kao postojeći anthropic-client.ts; bez novog dependency-ja)
//   OpenAI    — GPT (model iz env-a; npr. gpt-5.5)
//
// API ključevi:
//   ANTHROPIC_MARIA_CLAUDIA_API_KEY   → Anthropic (Sonnet 4.6)
//   OPENAI_MARIA_CLAUDIA_API_KEY      → OpenAI (GPT 5.5)
//   DEEPSEEK_API_KEY_SYSTEM / DEEPSEEK_API_KEY → DeepSeek (nepromenjeno)

import OpenAI from "openai";

export type LlmProvider = "deepseek" | "anthropic" | "openai";

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  /** Anthropic / OpenAI prompt-cache hit tokens (cheaper). */
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface LlmResult {
  text: string;
  usage: LlmUsage;
  latencyMs: number;
  provider: LlmProvider;
  model: string;
}

export interface LlmCompleteOptions {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens?: number;
  /** Strict JSON schema output where the provider supports it (8.2). */
  jsonSchema?: Record<string, unknown>;
  /** Provider-native JSON-object mode (no schema) — DeepSeek/OpenAI only. */
  jsonObjectMode?: boolean;
}

export interface LlmAdapter {
  provider: LlmProvider;
  model: string;
  complete(opts: LlmCompleteOptions): Promise<LlmResult>;
}

// ── Cost table (USD per 1M tokens) ──────────────────────────────────────────
// Claude prices are authoritative (Sonnet 4.6 $3/$15, Haiku 4.5 $1/$5).
// DeepSeek is an estimate — verify against live billing. GPT price is unknown
// here; the harness reads it from env so cost is measured, not guessed.
export const MODEL_PRICE_USD_PER_MTOK: Record<
  string,
  { input: number; output: number }
> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "deepseek-chat": { input: 0.28, output: 0.42 },
};

export const DEFAULT_MODELS: Record<LlmProvider, string> = {
  deepseek: "deepseek-chat",
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-5.5",
};

// ── OpenAI-compatible adapter (DeepSeek + OpenAI GPT) ───────────────────────

function openAiCompatibleAdapter(input: {
  provider: LlmProvider;
  model: string;
  apiKey: string;
  baseURL?: string;
  /** GPT-5.x rejects max_tokens — uses max_completion_tokens. */
  tokenParam: "max_tokens" | "max_completion_tokens";
}): LlmAdapter {
  const client = new OpenAI({ apiKey: input.apiKey, baseURL: input.baseURL });
  return {
    provider: input.provider,
    model: input.model,
    async complete(opts) {
      const started = Date.now();
      const responseFormat = opts.jsonSchema
        ? ({
            type: "json_schema",
            json_schema: {
              name: "agent_contract",
              schema: opts.jsonSchema,
              strict: true,
            },
          } as const)
        : opts.jsonObjectMode
          ? ({ type: "json_object" } as const)
          : undefined;
      const body: Record<string, unknown> = {
        model: input.model,
        messages: [{ role: "system", content: opts.system }, ...opts.messages],
        [input.tokenParam]: opts.maxTokens ?? 700,
      };
      if (responseFormat) body.response_format = responseFormat;
      const completion = (await client.chat.completions.create(
        body as unknown as Parameters<typeof client.chat.completions.create>[0],
      )) as OpenAI.Chat.Completions.ChatCompletion;
      const latencyMs = Date.now() - started;
      const text = completion.choices[0]?.message?.content ?? "";
      const usage = completion.usage;
      const cached = (
        usage as { prompt_tokens_details?: { cached_tokens?: number } }
      )?.prompt_tokens_details?.cached_tokens;
      return {
        text,
        latencyMs,
        provider: input.provider,
        model: input.model,
        usage: {
          inputTokens: usage?.prompt_tokens ?? 0,
          outputTokens: usage?.completion_tokens ?? 0,
          cacheReadTokens: cached,
        },
      };
    },
  };
}

// ── Anthropic adapter (Messages API via raw fetch) ──────────────────────────

function anthropicAdapter(input: {
  model: string;
  apiKey: string;
}): LlmAdapter {
  return {
    provider: "anthropic",
    model: input.model,
    async complete(opts) {
      const started = Date.now();
      const body: Record<string, unknown> = {
        model: input.model,
        max_tokens: opts.maxTokens ?? 700,
        // cache_control on the (large, stable) system prompt — repeated eval
        // calls read it back at ~0.1x instead of re-billing every time.
        system: [
          {
            type: "text",
            text: opts.system,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: opts.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      };
      // Sonnet 4.6 supports structured outputs — guarantees valid JSON.
      if (opts.jsonSchema) {
        body.output_config = {
          format: { type: "json_schema", schema: opts.jsonSchema },
        };
      }
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": input.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`anthropic ${res.status}: ${errText.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        content?: Array<{ type?: string; text?: string }>;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
        };
      };
      const text = Array.isArray(data.content)
        ? data.content
            .map((b) => (typeof b.text === "string" ? b.text : ""))
            .join("")
        : "";
      const u = data.usage ?? {};
      return {
        text,
        latencyMs,
        provider: "anthropic",
        model: input.model,
        usage: {
          inputTokens: u.input_tokens ?? 0,
          outputTokens: u.output_tokens ?? 0,
          cacheReadTokens: u.cache_read_input_tokens,
          cacheWriteTokens: u.cache_creation_input_tokens,
        },
      };
    },
  };
}

// ── Factory + env wiring ────────────────────────────────────────────────────

export function createAdapter(
  provider: LlmProvider,
  opts: { apiKey: string; model?: string },
): LlmAdapter {
  const model = opts.model ?? DEFAULT_MODELS[provider];
  if (provider === "anthropic") {
    return anthropicAdapter({ model, apiKey: opts.apiKey });
  }
  if (provider === "deepseek") {
    return openAiCompatibleAdapter({
      provider,
      model,
      apiKey: opts.apiKey,
      baseURL: "https://api.deepseek.com/v1",
      tokenParam: "max_tokens",
    });
  }
  return openAiCompatibleAdapter({
    provider: "openai",
    model,
    apiKey: opts.apiKey,
    tokenParam: "max_completion_tokens",
  });
}

/** Reads the provider's API key + optional model override from the env, using
 * the exact (hyphenated) variable names. Returns null when no key is set so
 * the harness can skip a provider cleanly. */
export function adapterFromEnv(
  provider: LlmProvider,
  env: NodeJS.ProcessEnv = process.env,
): LlmAdapter | null {
  if (provider === "anthropic") {
    const apiKey = env["ANTHROPIC_MARIA_CLAUDIA_API_KEY"];
    if (!apiKey) return null;
    return createAdapter("anthropic", {
      apiKey,
      model: env.ANTHROPIC_MARIA_CLAUDIA_MODEL,
    });
  }
  if (provider === "openai") {
    const apiKey = env["OPENAI_MARIA_CLAUDIA_API_KEY"];
    if (!apiKey) return null;
    return createAdapter("openai", {
      apiKey,
      model: env.OPENAI_MARIA_CLAUDIA_MODEL,
    });
  }
  const apiKey = env.DEEPSEEK_API_KEY_SYSTEM ?? env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  return createAdapter("deepseek", {
    apiKey,
    model: env.DEEPSEEK_MARIA_CLAUDIA_MODEL,
  });
}

// src/lib/ai/models/aiModelRegistry.ts
//
// Model Lab — server-authoritative registar runtime modela. Jedini izvor istine
// o tome koji su modeli dostupni (računato iz konfigurisanih ključeva) i koji je
// default. Klijent samo izražava preferenciju; server uvek validira i pada na
// default. NIKAD ne veruj frontendu.
//
// `id` je javni/select identifikator (npr. "claude-sonnet-4.6"); `apiModel` je
// wire string koji ide adapteru (npr. "claude-sonnet-4-6" — tačka→crtica, inače
// 404). Adapter sloj se reuse-uje iz Faze 8 (eval/llm-adapter — deljena infra).

import { createAdapter, type LlmAdapter } from "@/lib/ai/eval/llm-adapter";

export type AiRuntimeProvider = "deepseek" | "anthropic" | "openai";

interface AiModelEntry {
  id: string;
  provider: AiRuntimeProvider;
  label: string;
  /** Wire model string za adapter (≠ javni id). */
  apiModel: string;
  isDefault?: boolean;
}

/** Serijalizabilni oblik koji ide klijentu kroz GET /api/ai/models. */
export interface PublicAiModel {
  id: string;
  provider: AiRuntimeProvider;
  label: string;
  available: boolean;
  default: boolean;
}

export const DEFAULT_MODEL_ID = "deepseek-v3.2";

const AI_MODEL_REGISTRY: AiModelEntry[] = [
  {
    id: "deepseek-v3.2",
    provider: "deepseek",
    label: "DeepSeek V3.2",
    apiModel: "deepseek-chat",
    isDefault: true,
  },
  {
    id: "claude-sonnet-4.6",
    provider: "anthropic",
    label: "Claude Sonnet 4.6",
    apiModel: "claude-sonnet-4-6",
  },
  {
    id: "gpt-5.5",
    provider: "openai",
    label: "GPT-5.5",
    apiModel: "gpt-5.5",
  },
];

function apiKeyFor(
  provider: AiRuntimeProvider,
  env: NodeJS.ProcessEnv,
): string | undefined {
  if (provider === "deepseek") {
    return env.DEEPSEEK_API_KEY_SYSTEM ?? env.DEEPSEEK_API_KEY;
  }
  if (provider === "anthropic") return env["ANTHROPIC_MARIA_CLAUDIA_API_KEY"];
  return env["OPENAI_MARIA_CLAUDIA_API_KEY"];
}

/** DeepSeek je uvek dostupan (produkciona invarijanta + garantovani fallback);
 * ostali zavise od konfigurisanog ključa. */
function isModelAvailable(
  entry: AiModelEntry,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (entry.provider === "deepseek") return true;
  return Boolean(apiKeyFor(entry.provider, env));
}

export function listAvailableModels(
  env: NodeJS.ProcessEnv = process.env,
): PublicAiModel[] {
  return AI_MODEL_REGISTRY.filter((entry) => isModelAvailable(entry, env)).map(
    (entry) => ({
      id: entry.id,
      provider: entry.provider,
      label: entry.label,
      available: true,
      default: entry.isDefault === true,
    }),
  );
}

function defaultEntry(): AiModelEntry {
  return (
    AI_MODEL_REGISTRY.find((e) => e.id === DEFAULT_MODEL_ID) ??
    AI_MODEL_REGISTRY[0]
  );
}

/** Server-authoritative: vrati izabrani entry ako postoji I dostupan je, inače
 * default. Nepoznat/nedostupan id sa frontenda → tihi fallback na DeepSeek. */
function resolveRuntimeModel(
  selectedModelId: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): AiModelEntry {
  if (!selectedModelId) return defaultEntry();
  const entry = AI_MODEL_REGISTRY.find((e) => e.id === selectedModelId);
  if (!entry || !isModelAvailable(entry, env)) return defaultEntry();
  return entry;
}

export interface ResolvedRuntimeAdapter {
  adapter: LlmAdapter;
  entry: AiModelEntry;
}

/** Resolve + napravi adapter za izabrani model. Ako ključ fali (ne bi trebalo
 * za dostupan model), pada na DeepSeek default. */
export function adapterFromModelId(
  selectedModelId: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedRuntimeAdapter {
  let entry = resolveRuntimeModel(selectedModelId, env);
  let apiKey = apiKeyFor(entry.provider, env);
  if (!apiKey) {
    entry = defaultEntry();
    apiKey = apiKeyFor(entry.provider, env);
  }
  const adapter = createAdapter(entry.provider, {
    apiKey: apiKey ?? "",
    model: entry.apiModel,
  });
  return { adapter, entry };
}

/** Fallback procena tokena kad provajder ne vrati usage (≈4 znaka/token). */
export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 4);
}

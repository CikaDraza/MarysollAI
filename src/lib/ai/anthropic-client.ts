// src/lib/ai/anthropic-client.ts
//
// Phase E — Anthropic Claude as a fallback/repair model.
//
// DeepSeek stays the primary (cheap) orchestrator. Claude is only invoked when
// DeepSeek returns JSON that won't parse into a usable Claudia contract. Claude
// is far more reliable at "repair this into strict JSON", so this rescues turns
// that would otherwise hit the reset fallback.
//
// Implemented over fetch (no SDK dependency) so it works without installing
// anything and degrades to a no-op when no real key is configured. Uses prompt
// caching on the (large, stable) system prompt to keep repair calls cheap.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const PLACEHOLDER_KEY = "sk-ant-your-key-here";
const DEFAULT_MODEL = "claude-haiku-4-5";
const REPAIR_TIMEOUT_MS = 15_000;

function getAnthropicKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key || key === PLACEHOLDER_KEY || !key.startsWith("sk-ant-")) return null;
  return key;
}

/** True when a real Anthropic key is configured (not the placeholder). */
export function isAnthropicEnabled(): boolean {
  return getAnthropicKey() !== null;
}

/**
 * Asks Claude to repair a broken DeepSeek response into a valid Claudia JSON
 * contract. Returns the repaired JSON string, or null when Claude is disabled,
 * times out, or fails — in which case the caller falls back deterministically.
 */
export async function repairClaudiaJson(input: {
  systemPrompt: string;
  brokenRaw: string;
  userInput: string;
}): Promise<string | null> {
  const key = getAnthropicKey();
  if (!key) return null;

  const model = process.env.ANTHROPIC_FALLBACK_MODEL?.trim() || DEFAULT_MODEL;

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        temperature: 0,
        system: [
          {
            // Reuse Claudia's own system prompt so Claude produces a response in
            // exactly the same contract. Cached because it is large and stable.
            type: "text",
            text: input.systemPrompt,
            cache_control: { type: "ephemeral" },
          },
          {
            type: "text",
            text: "Vrati ISKLJUČIVO jedan validan JSON objekat po Claudia šemi (polja: messages, layout, intent). Bez markdown ograda, bez teksta van JSON-a.",
          },
        ],
        messages: [
          {
            role: "user",
            content:
              `Korisnikova poruka: ${input.userInput}\n\n` +
              `Prethodni odgovor nije validan JSON. Popravi ga u ispravan Claudia JSON contract:\n` +
              input.brokenRaw.slice(0, 4000),
          },
        ],
      }),
      signal: AbortSignal.timeout(REPAIR_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error("[anthropic] repair HTTP error:", res.status);
      return null;
    }

    const data = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = Array.isArray(data.content)
      ? data.content.map((b) => (typeof b.text === "string" ? b.text : "")).join("")
      : "";
    return text.trim() || null;
  } catch (err) {
    console.error("[anthropic] repair error:", err);
    return null;
  }
}

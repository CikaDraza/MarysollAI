// src/lib/ai/parseClaudiaResponse.ts
//
// Phase 2 — Hardened Claudia response parser.
//
// The model occasionally returns:
//   - JSON wrapped in ```json fences
//   - Trailing prose after the JSON
//   - Truncated JSON when the stream is cut
//   - Empty content
//   - Duplicated block entries in `layout`
//   - Non-array `messages`
//
// Goal: never throw, never crash the UI. Fall back to a safe shape that the
// LayoutEngine + thread can render — even if degraded.
import partialParse from "partial-json-parser";
import { TextMessage } from "@/types/ai/ai.text-engine";
import { BaseBlock, BlockTypes } from "@/types/landing-block";
import { aiLog } from "@/lib/ai/debug-log";

const log = aiLog("AI_ORCHESTRATOR");

export interface ClaudiaResponse {
  messages: TextMessage[];
  layout: BaseBlock[];
}

const SAFE_FALLBACK: ClaudiaResponse = {
  messages: [
    {
      content: "Izvini, dogodila se greška. Pokušaj ponovo.",
      role: "assistant",
    } as TextMessage,
  ],
  layout: [],
};

/** Strip ```json / ``` fences and any leading/trailing whitespace. */
function stripCodeFences(raw: string): string {
  let s = raw.trim();
  // Markdown fence variants
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  // Some models emit "Here is the JSON:" prose before the object
  const firstBrace = s.indexOf("{");
  const lastBrace = s.lastIndexOf("}");
  if (firstBrace > 0 && lastBrace > firstBrace) {
    s = s.slice(firstBrace, lastBrace + 1);
  }
  return s.trim();
}

/** Best-effort parse: strict JSON first, then partial-json fallback. */
function tryParse(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    /* fall through */
  }
  try {
    return partialParse(raw);
  } catch {
    return null;
  }
}

function isMessage(v: unknown): v is TextMessage {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.content === "string";
}

function isBlock(v: unknown): v is BaseBlock {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.type === "string" && o.type.length > 0;
}

/** Dedupe blocks by `type` (last write wins). The model occasionally emits the
 * same block twice in one response — the LayoutEngine also dedupes downstream
 * but cleaning here keeps the thread item count accurate. */
function dedupeBlocks(blocks: BaseBlock[]): BaseBlock[] {
  const byType = new Map<string, BaseBlock>();
  for (const b of blocks) byType.set(b.type, b);
  return Array.from(byType.values());
}

/**
 * Top-level entry. Always returns a valid ClaudiaResponse. Logs the failure
 * mode in dev so we can spot prompt regressions, but the caller never has to
 * handle "did the parse succeed?".
 */
export function parseClaudiaResponse(rawStream: string): ClaudiaResponse {
  if (!rawStream || rawStream.trim().length === 0) {
    log("parse.empty_stream");
    return SAFE_FALLBACK;
  }

  const cleaned = stripCodeFences(rawStream);
  const parsed = tryParse(cleaned);

  if (!parsed || typeof parsed !== "object") {
    log("parse.unparseable", { sample: cleaned.slice(0, 80) });
    return SAFE_FALLBACK;
  }

  const obj = parsed as Record<string, unknown>;

  const rawMessages = Array.isArray(obj.messages) ? obj.messages : [];
  const messages: TextMessage[] = rawMessages.filter(isMessage).map((m) => {
    const raw = m as unknown as Record<string, unknown>;
    const attach =
      typeof raw.attachToBlockType === "string" && raw.attachToBlockType !== "none"
        ? (raw.attachToBlockType as BlockTypes)
        : undefined;
    return {
      ...m,
      role: "assistant" as const,
      attachToBlockType: attach,
    };
  });

  const rawLayout = Array.isArray(obj.layout) ? obj.layout : [];
  const layout = dedupeBlocks(rawLayout.filter(isBlock));

  // Edge case: parsed-but-empty. Surface a placeholder rather than nothing,
  // so the user sees the AI responded.
  if (messages.length === 0 && layout.length === 0) {
    log("parse.empty_object");
    return {
      messages: [
        {
          content: "Razumem. Možeš li da pojasniš šta tražiš?",
          role: "assistant",
        } as TextMessage,
      ],
      layout: [],
    };
  }

  return { messages, layout };
}

/**
 * Streaming-only partial-text extractor. Used while the response is in flight
 * to drive the typewriter effect. Returns the text as it currently exists,
 * never throws.
 */
export function extractStreamingText(rawSoFar: string): string {
  if (!rawSoFar) return "";
  const cleaned = stripCodeFences(rawSoFar);
  const parsed = tryParse(cleaned);
  if (!parsed || typeof parsed !== "object") return "";
  const messages = (parsed as { messages?: Array<{ content?: string }> }).messages;
  if (!Array.isArray(messages)) return "";
  return messages
    .map((m) => (typeof m?.content === "string" ? m.content : ""))
    .filter(Boolean)
    .join("\n\n");
}

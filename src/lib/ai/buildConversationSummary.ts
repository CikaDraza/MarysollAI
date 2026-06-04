// src/lib/ai/buildConversationSummary.ts
//
// Phase B — rolling conversation summary.
//
// The LLM fallback only receives the last N message turns (a sliding window).
// On long conversations the earlier turns fall off and the model loses the
// thread — it re-asks questions or drifts. Structured booking fields are kept
// separately in `bookingFlow.collected`, but the *conversational* gist (what
// was asked, what was answered, what the user rejected) is not.
//
// This builds a compact, deterministic recap of the messages that sit BEFORE
// the recent window, so the model keeps continuity without an extra (slow,
// costly) summarization API call. It is intentionally lossy and capped.
import { ThreadItem } from "@/types/ai/chat-thread";

const MAX_SUMMARY_LINES = 12;
const MAX_LINE_CHARS = 140;
const MAX_TOTAL_CHARS = 1400;

function compactLine(role: "user" | "assistant", content: string): string {
  const speaker = role === "user" ? "Korisnik" : "Claudia";
  const text = content.replace(/\s+/g, " ").trim();
  const clipped =
    text.length > MAX_LINE_CHARS ? `${text.slice(0, MAX_LINE_CHARS - 1)}…` : text;
  return `- ${speaker}: ${clipped}`;
}

/**
 * Returns a compact recap of the messages that precede the recent window
 * (`history` minus its last `recentWindow` message items). Empty string when
 * there is nothing older to summarize.
 */
export function buildConversationSummary(
  history: ThreadItem[],
  recentWindow: number,
): string {
  const messages = history.filter(
    (item): item is Extract<ThreadItem, { type: "message" }> =>
      item.type === "message" &&
      typeof item.data?.content === "string" &&
      item.data.content.trim().length > 0,
  );

  // Only the turns that fall OUTSIDE the recent verbatim window need recapping.
  const older = messages.slice(0, Math.max(0, messages.length - recentWindow));
  if (older.length === 0) return "";

  // Keep the most recent of the older turns (closest to the live window) since
  // they carry the freshest context; cap by line count and total length.
  const tail = older.slice(-MAX_SUMMARY_LINES);
  const lines: string[] = [];
  let total = 0;
  for (const item of tail) {
    const role = item.data.role === "user" ? "user" : "assistant";
    const line = compactLine(role, item.data.content);
    if (total + line.length > MAX_TOTAL_CHARS) break;
    lines.push(line);
    total += line.length;
  }
  if (lines.length === 0) return "";

  return [
    "\n\n# RANIJI TOK RAZGOVORA (sažetak)",
    "Ovo su raniji delovi razgovora (sažeto). Koristi ih za kontinuitet; ne ponavljaj već postavljena pitanja.",
    ...lines,
  ].join("\n");
}

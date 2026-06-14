// src/lib/ai/claudia/antiDeadEndGuard.ts
//
// Deterministic self-check that runs on Claudia's final response before it
// ships. NOT a second LLM. It catches dead-ends (empty reply, generic
// "ne razumem" with full context, re-asking an answered field, asserting
// results with no block) and replaces them with a context-preserving, single
// question — and clears any contradictory block so text and UI agree.
//
// Conservative by design: only rewrites on high-confidence dead-ends. When in
// doubt it leaves the response alone.

import type { ClaudiaTaskSummary } from "./buildClaudiaTaskSummary";

export interface LegacyAgentResponse {
  messages?: Array<{ role: string; content: string }>;
  layout?: Array<{ type?: string } & Record<string, unknown>>;
  intent?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface AntiDeadEndContext {
  taskSummary?: ClaudiaTaskSummary;
  previousAssistantMessage?: string;
}

export interface AntiDeadEndResult {
  response: LegacyAgentResponse;
  fixed: boolean;
  reason?: string;
}

function assistantText(r: LegacyAgentResponse): string {
  const msgs = Array.isArray(r.messages) ? r.messages : [];
  const assistant = msgs.filter(
    (m) => m?.role === "assistant" && typeof m?.content === "string",
  );
  return (assistant.length ? assistant[assistant.length - 1].content : "").trim();
}

/** Which critical fields a message is asking the user for. */
function asksForFields(text: string): Set<"city" | "service" | "date"> {
  const f = new Set<"city" | "service" | "date">();
  if (/u kom gradu|koji grad|koje mesto|grad koji/i.test(text)) f.add("city");
  if (/koju uslugu|koji tretman|šta želite da zakaž|sta zelite da zakaz/i.test(text))
    f.add("service");
  if (/koji datum|kog dana|koji dan|za kada|za koji dan/i.test(text)) f.add("date");
  return f;
}

/** Message asserts concrete results (slots/prices/salons) that must be backed by a block. */
function assertsResults(text: string): boolean {
  return /\b(evo (vam )?(dostupn\w+ )?termin|prona[šs]la sam termin|prikazujem termin|dostupni termini su|evo (vam )?cenovnik|evo (vam )?salon)/i.test(
    text,
  );
}

function fieldKnown(
  s: ClaudiaTaskSummary | undefined,
  f: "city" | "service" | "date",
): boolean {
  return Boolean(s?.known?.[f]);
}

/** Context-preserving recovery message built from what we already know. */
function recoveryMessage(s?: ClaudiaTaskSummary): string {
  const svc = s?.known.service;
  const city = s?.known.city;
  switch (s?.nextBestStep) {
    case "ask_city":
      return svc
        ? `Razumem da želite ${svc}. U kom gradu da proverim termine?`
        : "U kom gradu da proverim?";
    case "ask_service":
      return city
        ? `Razumem da je u pitanju ${city}. Koju uslugu želite?`
        : "Koju uslugu želite da zakažemo?";
    case "ask_date":
      return `Za koji dan da proverim termine${svc ? ` za ${svc}` : ""}?`;
    case "show_appointments":
      return "Da proverim Vaše termine — prijavite se ako već niste.";
    default: {
      const bits = [svc && `usluga ${svc}`, city && `grad ${city}`]
        .filter(Boolean)
        .join(", ");
      return bits
        ? `Imam ${bits}. Možete li mi reći šta još želite da uradimo?`
        : "Možete li mi reći šta tačno želite da uradimo?";
    }
  }
}

/** Replace the reply with a clean single-question recovery; clear blocks so
 *  text and UI never contradict. Preserves intent + any side fields. */
function fix(
  r: LegacyAgentResponse,
  s: ClaudiaTaskSummary | undefined,
  reason: string,
): AntiDeadEndResult {
  // Reuse the existing message object so any extra fields (id/type) survive;
  // only the content is replaced. Clear blocks so text and UI can't contradict.
  const existing =
    (r.messages ?? []).find((m) => m?.role === "assistant") ?? r.messages?.[0];
  const message = existing
    ? { ...existing, role: "assistant", content: recoveryMessage(s) }
    : { role: "assistant", content: recoveryMessage(s) };
  return {
    response: { ...r, messages: [message], layout: [] },
    fixed: true,
    reason,
  };
}

export function applyAntiDeadEndGuard(
  response: LegacyAgentResponse,
  ctx: AntiDeadEndContext = {},
): AntiDeadEndResult {
  const r = response ?? {};
  const text = assistantText(r);
  const s = ctx.taskSummary;
  const layout = Array.isArray(r.layout) ? r.layout : [];

  // 1. Empty/blank reply — never ship silence.
  if (!text) return fix(r, s, "empty_message");

  // 2. Generic "ne razumem" while we already know something.
  if (
    /\bne razumem\b|nisam (vas )?razumela|ne razumijem|možete li (da )?ponovite|ponoviti/i.test(
      text,
    ) &&
    (fieldKnown(s, "service") || fieldKnown(s, "city"))
  ) {
    return fix(r, s, "generic_not_understood_with_context");
  }

  // 3/4. Asking for a field we already know, or repeating a question the user answered.
  if (s) {
    const asks = asksForFields(text);
    if (asks.has("city") && fieldKnown(s, "city"))
      return fix(r, s, "asked_known_city");
    if (asks.has("service") && fieldKnown(s, "service"))
      return fix(r, s, "asked_known_service");
    if (ctx.previousAssistantMessage) {
      const prevAsks = asksForFields(ctx.previousAssistantMessage);
      for (const f of asks) {
        if (prevAsks.has(f) && fieldKnown(s, f))
          return fix(r, s, `repeated_question_${f}`);
      }
    }
  }

  // 5. Asserts concrete results but ships no block to back them.
  if (assertsResults(text) && layout.length === 0) {
    return fix(r, s, "announced_block_missing");
  }

  return { response: r, fixed: false };
}

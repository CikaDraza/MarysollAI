// src/lib/ai/memory/formatAgentMemoryForPrompt.ts
//
// Kompaktan memory format za system prompt.
// Proceduralnih pravila nema ovde — ona idu u buildMariaPrompt/buildClaudiaPrompt
// direktno, gde im je mesto. Ovde su samo stanja razgovora.

import type { AgentMemoryContext } from "./agent-memory-types";

function valueOrDash(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
}

function formatKnown(memory: AgentMemoryContext): string {
  const c = memory.workingMemory.collected ?? {};
  const entries = [
    ["service", c.service],
    ["city", c.city],
    ["salon", c.salonName ?? c.salonId],
    ["date", c.date],
    [
      "time",
      c.time ??
        (c.timeWindowStart != null ? `posle ${c.timeWindowStart}h` : null),
    ],
  ].filter(([, v]) => v !== undefined && v !== null && v !== "");
  return entries.length ? entries.map(([k, v]) => `${k}=${v}`).join(", ") : "-";
}

function formatEpisodicShort(memory: AgentMemoryContext): string {
  const ep = memory.episodicMemory;
  if (!ep) return "";
  const lines: string[] = [];
  if (ep.preferredCities.length)
    lines.push(
      `preferred cities: ${ep.preferredCities.slice(0, 2).join(", ")}`,
    );
  if (ep.preferredServices.length)
    lines.push(
      `preferred services: ${ep.preferredServices.slice(0, 2).join(", ")}`,
    );
  if (ep.lastSuccessfulBooking) {
    const s = ep.lastSuccessfulBooking;
    lines.push(
      `last booking: ${[s.service, s.city, s.salonName].filter(Boolean).join(" / ")}`,
    );
  }
  return lines.length
    ? `Episodic:\n${lines.map((l) => `- ${l}`).join("\n")}`
    : "";
}

export function formatAgentMemoryForPrompt(memory: AgentMemoryContext): string {
  const w = memory.workingMemory;
  const known = formatKnown(memory);
  const missing = w.missingFields.length ? w.missingFields.join(", ") : "-";
  const episodic = formatEpisodicShort(memory);

  const parts = [
    "# CONVERSATION STATE",
    `known: ${known}`,
    `missing: ${missing}`,
    w.selectedSlot ? "selectedSlot: present" : null,
    w.pendingBooking ? "pendingBooking: present" : null,
    w.lastSystemAction ? `lastAction: ${w.lastSystemAction}` : null,
    episodic || null,
  ].filter(Boolean);

  return parts.join("\n");
}

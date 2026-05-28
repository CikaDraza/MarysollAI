import type { AgentMemoryContext } from "./agent-memory-types";

function valueOrDash(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
}

function formatKnown(memory: AgentMemoryContext): string {
  const collected = memory.workingMemory.collected ?? {};
  const entries = [
    ["service", collected.service],
    ["city", collected.city],
    ["category", collected.category],
    ["salon", collected.salonName ?? collected.salonId],
    ["date", collected.date],
    ["time", collected.time],
    ["timeWindowStart", collected.timeWindowStart],
    ["timeWindowEnd", collected.timeWindowEnd],
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");

  return entries.length
    ? entries.map(([key, value]) => `${key}=${value}`).join(", ")
    : "-";
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/š/g, "s")
    .replace(/đ/g, "dj")
    .replace(/ž/g, "z")
    .replace(/č/g, "c")
    .replace(/ć/g, "c")
    .trim();
}

function formatSemantic(memory: AgentMemoryContext): string[] {
  const semantic = memory.semanticMemory;
  if (!semantic) return ["- none"];

  const collected = memory.workingMemory.collected;
  const query = normalize(
    [collected?.service, collected?.category].filter(Boolean).join(" "),
  );
  const services = semantic.services
    .filter((service) => {
      if (!query) return true;
      const candidates = [
        service.label,
        service.categoryLabel,
        service.categoryKey,
        ...service.synonyms,
      ]
        .filter((value): value is string => Boolean(value))
        .map(normalize);
      return candidates.some(
        (candidate) => candidate.includes(query) || query.includes(candidate),
      );
    })
    .slice(0, query ? 6 : 8);

  if (services.length === 0) return ["- none"];

  return services.map((service) => {
    const synonyms = service.synonyms
      .filter((synonym) => normalize(synonym) !== normalize(service.label))
      .slice(0, 2);
    const label = synonyms.length
      ? `${service.label}/${synonyms.join("/")}`
      : service.label;
    const category = service.categoryLabel ?? service.categoryKey ?? "unknown";
    const cities = service.cities.slice(0, 4).join(", ") || "-";
    return `- ${label} -> ${category}; cities: ${cities}`;
  });
}

function formatEpisodic(memory: AgentMemoryContext): string[] {
  const episodic = memory.episodicMemory;
  if (!episodic) return [];

  const lines: string[] = [];
  const lastSuccess = episodic.lastSuccessfulBooking;
  if (lastSuccess) {
    const subject = [
      lastSuccess.service,
      lastSuccess.city ? `u ${lastSuccess.city}` : undefined,
    ]
      .filter(Boolean)
      .join(" ");
    const salon = lastSuccess.salonName ? `, ${lastSuccess.salonName}` : "";
    lines.push(`- last success: ${subject || "booking"}${salon}`);
  }

  if (episodic.lastFailedBooking) {
    const failed = episodic.lastFailedBooking;
    const parts = [
      failed.reason,
      failed.requestedTime ? `at ${failed.requestedTime}` : undefined,
      failed.recoveryUsed ? "recovery used" : undefined,
      failed.salonName,
    ].filter(Boolean);
    lines.push(`- last failed: ${parts.join(", ")}`);
  }

  const preferences: string[] = [];
  if (episodic.preferredCities.length) {
    preferences.push(`cities ${episodic.preferredCities.join("/")}`);
  }
  if (episodic.preferredServices.length) {
    preferences.push(`services ${episodic.preferredServices.join("/")}`);
  }
  if (episodic.preferredSalons.length) {
    preferences.push(`salons ${episodic.preferredSalons.join("/")}`);
  }
  if (preferences.length) lines.push(`- preferences: ${preferences.join("; ")}`);

  return lines.slice(0, 3);
}

export function formatAgentMemoryForPrompt(memory: AgentMemoryContext): string {
  const working = memory.workingMemory;
  const missing = working.missingFields.length
    ? working.missingFields.join(", ")
    : "-";
  const roles = memory.proceduralMemory.agentRoles;
  const ownership = memory.proceduralMemory.systemOwnershipRules;
  const workflow = memory.proceduralMemory.workflowRules;
  const episodicLines = formatEpisodic(memory);
  const episodicSection = episodicLines.length
    ? `

Episodic:
${episodicLines.join("\n")}`
    : "";

  return `
# MEMORY CONTEXT

Working:
- activeAgent: ${valueOrDash(working.activeAgent)}
- workflowStep: ${valueOrDash(working.workflowStep)}
- known: ${formatKnown(memory)}
- missing: ${missing}
- selectedSlot: ${working.selectedSlot ? "present" : "-"}
- pendingBooking: ${working.pendingBooking ? "present" : "-"}
- lastSystemAction: ${valueOrDash(working.lastSystemAction)}
- lastRecoveryReason: ${valueOrDash(working.lastRecoveryReason)}
- lastAssistantMessage: ${valueOrDash(working.lastAssistantMessage)}

Procedural:
- Maria: FAQ + intent extraction + routing.
- Claudia: booking/search/recovery.
- ${ownership.find((rule) => rule.startsWith("Orchestrator owns")) ?? "Orchestrator owns workflow."}
- ${workflow.find((rule) => rule.includes("preserve known fields")) ?? "AI must preserve known fields."}
- ${workflow.find((rule) => rule.includes("ask only the next missing field")) ?? "AI must ask one missing field at a time."}
- ${ownership.find((rule) => rule.includes("never directly open modal")) ?? "AI never opens modals directly."}
- ${workflow.find((rule) => rule.includes("Episodic memory is read-only context")) ?? "Episodic memory is read-only context; it may suggest, never decide actions."}
- ${roles[0]}
- ${roles[1]}

Semantic:
${formatSemantic(memory).join("\n")}
${episodicSection}
`.trim();
}

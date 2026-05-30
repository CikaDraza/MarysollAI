import {
  getClaudiaCommunicationRules,
  getCommunicationExamples,
  getForbiddenAgentPhrases,
  getMariaCommunicationRules,
  type CommunicationAgent,
} from "./agent-communication-rules";

function formatExamples(agent: CommunicationAgent): string {
  return getCommunicationExamples(agent)
    .slice(0, agent === "maria" ? 8 : 5)
    .map((example) => `User: ${example.user}\n${agent === "maria" ? "Maria" : "Claudia"}: ${example.assistant}`)
    .join("\n");
}

export function formatCommunicationRulesForPrompt(
  agent: CommunicationAgent,
): string {
  const rules =
    agent === "maria"
      ? getMariaCommunicationRules()
      : getClaudiaCommunicationRules();
  const visibleIntents =
    "Use visible message intent: greeting, faq_answer, clarify, handoff_status, booking_status, selection_ack, recovery, success, error, thanks, unknown.";
  const forbidden = getForbiddenAgentPhrases(agent)
    .slice(0, agent === "maria" ? 15 : 17)
    .join(", ");

  return `
# COMMUNICATION STYLE
${rules.map((rule) => `- ${rule}`).join("\n")}

# MESSAGE INTENT
- ${visibleIntents}
- This guides visible text only; structured contracts still go through the orchestrator.

# NEVER SAY
- ${forbidden}

# EXAMPLES
${formatExamples(agent)}
`.trim();
}

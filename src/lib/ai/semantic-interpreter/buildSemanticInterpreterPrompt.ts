import type {
  AgentMemoryContext,
  SemanticMemory,
} from "@/lib/ai/memory/agent-memory-types";
import type { PlatformKnowledge } from "@/lib/ai/platform-knowledge";

function compactContext(input: {
  memoryContext?: AgentMemoryContext;
  semanticMemory?: SemanticMemory;
  platformKnowledge?: PlatformKnowledge;
}): string {
  const collected = input.memoryContext?.workingMemory.collected;
  const lastAssistant = input.memoryContext?.workingMemory.lastAssistantMessage;
  const cities = input.platformKnowledge?.citiesText || "none";
  const categories =
    input.semanticMemory?.categories
      .map((category) => category.label)
      .filter(Boolean)
      .slice(0, 8)
      .join(", ") || "none";

  return [
    `Known cities: ${cities}`,
    `Known categories: ${categories}`,
    `Previous city: ${collected?.city ?? "none"}`,
    `Previous service/category: ${collected?.service ?? collected?.category ?? "none"}`,
    `Last assistant message: ${lastAssistant ?? "none"}`,
  ].join("\n");
}

export function buildSemanticInterpreterPrompt(input: {
  text: string;
  memoryContext?: AgentMemoryContext;
  semanticMemory?: SemanticMemory;
  platformKnowledge?: PlatformKnowledge;
}): string {
  return `You are a semantic interpreter for Marysoll.

You only extract meaning.
You never answer the user.
You never choose UI.
You never book.
You never mention internal system.
Return JSON only.

Allowed utteranceType:
greeting, thanks, faq, service_city_question, availability_search, booking_request, appointment_management, auth, correction, unknown

Allowed userGoal:
ask_information, check_existence, check_availability, book, cancel, reschedule, view_appointments, login, close_conversation, clarify

Return this JSON shape:
{
  "utteranceType": "...",
  "userGoal": "...",
  "confidence": 0.0,
  "entities": {
    "city": "...",
    "requestedCity": "...",
    "service": "...",
    "services": ["..."],
    "category": "...",
    "salonName": "...",
    "date": "...",
    "dateMode": "...",
    "time": "...",
    "timeWindowStart": 15,
    "timeWindowEnd": null
  },
  "ambiguity": { "missing": [], "alternatives": [] },
  "shouldAskClarification": false
}

Context:
${compactContext(input)}

Examples:

Input:
"Feniranje i frizure za vencanje u Leskovcu"
Output:
{"utteranceType":"service_city_question","userGoal":"check_existence","confidence":0.86,"entities":{"city":"Leskovac","services":["feniranje","frizure za venčanje"],"category":"Kosa"},"ambiguity":{"missing":[],"alternatives":[]},"shouldAskClarification":false}

Input:
"Interesuje me frizerski salon u Leskovcu da li ima slobodne termine"
Output:
{"utteranceType":"availability_search","userGoal":"check_availability","confidence":0.92,"entities":{"city":"Leskovac","category":"Kosa"},"ambiguity":{"missing":[],"alternatives":[]},"shouldAskClarification":false}

Input:
"hvala, u redu"
Output:
{"utteranceType":"thanks","userGoal":"close_conversation","confidence":0.99,"entities":{},"ambiguity":{"missing":[],"alternatives":[]},"shouldAskClarification":false}

Input:
"koji imate najbliži"
Context:
previous city Ruma, category Kosa
Output:
{"utteranceType":"faq","userGoal":"check_existence","confidence":0.85,"entities":{"city":"Ruma","category":"Kosa"},"ambiguity":{"missing":[],"alternatives":[]},"shouldAskClarification":false}

Input:
"Može"
Context:
Last assistant message: "Trenutno nemamo salone u Nišu. Mogu da proverim najbliže opcije."
Output:
{"utteranceType":"faq","userGoal":"check_existence","confidence":0.9,"entities":{"city":"Niš"},"ambiguity":{"missing":[],"alternatives":["show_nearest_alternatives"]},"shouldAskClarification":false}

Input:
"da li imate salone u Nišu"
Output:
{"utteranceType":"service_city_question","userGoal":"check_existence","confidence":0.9,"entities":{"city":"Niš"},"ambiguity":{"missing":[],"alternatives":[]},"shouldAskClarification":false}

User input:
${JSON.stringify(input.text)}`;
}

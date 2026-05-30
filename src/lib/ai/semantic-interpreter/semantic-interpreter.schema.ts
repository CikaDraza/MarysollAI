import { z } from "zod";

export const UtteranceTypeSchema = z.enum([
  "greeting",
  "thanks",
  "faq",
  "service_city_question",
  "availability_search",
  "booking_request",
  "appointment_management",
  "auth",
  "correction",
  "unknown",
]);

export const UserGoalSchema = z.enum([
  "ask_information",
  "check_existence",
  "check_availability",
  "book",
  "cancel",
  "reschedule",
  "view_appointments",
  "login",
  "close_conversation",
  "clarify",
]);

const ConfidenceSchema = z.preprocess(
  (value) => {
    if (typeof value === "string" && value.trim() !== "") return Number(value);
    return value;
  },
  z.number().catch(0).transform((value) => Math.min(1, Math.max(0, value))),
);

const OptionalHourSchema = z.preprocess(
  (value) => {
    if (typeof value === "string" && value.trim() !== "") return Number(value);
    return value;
  },
  z.number().nullable().optional().catch(undefined),
);

export const MeaningCandidateSchema = z.object({
  utteranceType: UtteranceTypeSchema.catch("unknown"),
  userGoal: UserGoalSchema.catch("clarify"),
  confidence: ConfidenceSchema,
  entities: z
    .object({
      city: z.string().optional(),
      requestedCity: z.string().optional(),
      service: z.string().optional(),
      services: z.array(z.string()).optional(),
      category: z.string().optional(),
      salonName: z.string().optional(),
      date: z.string().optional(),
      dateMode: z.string().optional(),
      time: z.string().optional(),
      timeWindowStart: OptionalHourSchema,
      timeWindowEnd: OptionalHourSchema,
    })
    .partial()
    .catch({})
    .default({}),
  ambiguity: z
    .object({
      missing: z.array(z.string()).catch([]).default([]),
      alternatives: z.array(z.string()).catch([]).default([]),
    })
    .partial()
    .catch({})
    .default({}),
  shouldAskClarification: z.boolean().catch(false).default(false),
});

export type UtteranceType = z.infer<typeof UtteranceTypeSchema>;
export type UserGoal = z.infer<typeof UserGoalSchema>;
export type MeaningCandidate = z.infer<typeof MeaningCandidateSchema>;

export const UNKNOWN_MEANING_CANDIDATE: MeaningCandidate = {
  utteranceType: "unknown",
  userGoal: "clarify",
  confidence: 0,
  entities: {},
  ambiguity: {
    missing: [],
    alternatives: [],
  },
  shouldAskClarification: true,
};

function stripCodeFences(raw: string): string {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1).trim();
  }
  return text;
}

function parseRaw(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(stripCodeFences(raw));
  } catch {
    return null;
  }
}

export function parseMeaningCandidate(raw: unknown): MeaningCandidate {
  const parsed = MeaningCandidateSchema.safeParse(parseRaw(raw));
  if (!parsed.success) return UNKNOWN_MEANING_CANDIDATE;
  return {
    ...parsed.data,
    entities: parsed.data.entities ?? {},
    ambiguity: {
      missing: parsed.data.ambiguity?.missing ?? [],
      alternatives: parsed.data.ambiguity?.alternatives ?? [],
    },
  };
}

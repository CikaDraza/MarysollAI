// src/lib/ai/schemas/maria.schema.ts
//
// Phase 1 — Maria response contract.
// Maria (the router) MUST return JSON matching this schema.
// Replaces the legacy `MariaRouteResponse` union which used different field
// names ("reply" vs "message") for handoff vs answer.
import { z } from "zod";

export const MariaTargetAgentSchema = z.enum([
  "booking",
  "auth",
  "prices",
  "appointments",
  "testimonials",
  "none",
]);
export type MariaTargetAgent = z.infer<typeof MariaTargetAgentSchema>;

export const MariaPayloadSchema = z
  .object({
    intent: z.string().optional(),
    service: z.string().optional(),
    city: z.string().optional(),
    date: z.string().optional(),
    time: z.string().optional(),
    selectedSlot: z.unknown().optional(),
    contact: z.unknown().optional(),
    aiBookingState: z.string().optional(),
  })
  .partial();
export type MariaPayload = z.infer<typeof MariaPayloadSchema>;

export const MariaResponseSchema = z.object({
  type: z.enum(["answer", "handoff"]),
  message: z.string(),
  targetAgent: MariaTargetAgentSchema,
  payload: MariaPayloadSchema.optional(),
});
export type MariaResponse = z.infer<typeof MariaResponseSchema>;

/**
 * Parse and validate raw Maria output. On failure, returns a safe fallback so
 * the UI never crashes from a malformed model response.
 */
export function parseMariaResponse(raw: unknown): MariaResponse {
  if (typeof raw === "string") {
    try {
      return MariaResponseSchema.parse(JSON.parse(raw));
    } catch {
      return { type: "answer", message: raw, targetAgent: "none" };
    }
  }

  const parsed = MariaResponseSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  // Legacy compat: handle old `{ type:"handoff", reply, targetAgent }` shape
  const r = raw as Record<string, unknown>;
  if (r && typeof r === "object" && typeof r.type === "string") {
    const legacyMessage =
      typeof r.message === "string"
        ? r.message
        : typeof r.reply === "string"
          ? r.reply
          : "";
    const target = MariaTargetAgentSchema.safeParse(r.targetAgent);
    return {
      type: r.type === "handoff" ? "handoff" : "answer",
      message: legacyMessage,
      targetAgent: target.success ? target.data : "none",
      payload: MariaPayloadSchema.safeParse(r.payload).success
        ? (r.payload as MariaPayload)
        : undefined,
    };
  }

  return { type: "answer", message: "", targetAgent: "none" };
}

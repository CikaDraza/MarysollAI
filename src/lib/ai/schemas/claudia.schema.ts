// src/lib/ai/schemas/claudia.schema.ts
//
// Defines the exhaustive set of intents Maria can hand off to Claudia.
// Any intent string not in this enum is a Maria-side bug (typo, model drift)
// and must NOT silently fall through to the LLM — it gets an explicit error response.
import { z } from "zod";

export const ClaudiaIntentSchema = z.enum([
  "appointments",
  "prices",
  "recover_missing_salon",
  "booking",
  "booking_conflict",
  "select_city",
  "select_salon",
  "login",
  "login_for_booking",
  "resume_booking_after_login",
  "create_booking",
]);

export type ClaudiaIntent = z.infer<typeof ClaudiaIntentSchema>;

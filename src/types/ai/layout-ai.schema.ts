// src/types/ai/layout-ai.schema.ts
import { z } from "zod";

const blockEnum = [
  "AuthBlock",
  "LoginBlock",
  "RegisterBlock",
  "ResetPasswordBlock",
  "ForgotPasswordBlock",
  "AppointmentCalendarBlock",
  "ServicePriceBlock",
  "TestimonialBlock",
  "NewsletterFormBlock",
  "WhyChooseUsBlock",
];

export const LayoutSuggestionSchema = z.object({
  type: z.literal("layout_suggestion"),
  intent: z.string(),
  blocks: z.array(
    z.object({
      type: z.enum(blockEnum),
      priority: z.number().int().min(1),
    }),
  ),
});

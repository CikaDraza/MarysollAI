// src/types/ai/layout-ai.schema.ts
import { z } from "zod";

export const LayoutSuggestionSchema = z.object({
  type: z.literal("layout_suggestion"),
  intent: z.string(),
  blocks: z.array(
    z.object({
      type: z.enum([
        "LoginBlock",
        "RegisterBlock",
        "AppointmentBlock",
        "AppointmentCalendarBlock",
        "ServicesBlock",
        "ServicePriceBlock",
        "TestimonialBlock",
        "NewsletterFormBlock",
        "WhyChooseUsBlock",
      ]),
      priority: z.number().int().min(1),
    })
  ),
});

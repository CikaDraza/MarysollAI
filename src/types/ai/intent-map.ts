// src/lib/ai/intent-map.ts

import { BlockTypes } from "@/types/block-types";

export type UserIntent =
  | "book_appointment"
  | "view_prices"
  | "view_testimonials"
  | "subscribe_newsletter"
  | "general_info";

export const INTENT_BLOCK_MAP: Record<UserIntent, BlockTypes[]> = {
  book_appointment: [
    "LoginBlock",
    "RegisterBlock",
    "AppointmentBlock",
    "AppointmentCalendarBlock",
  ],
  view_prices: ["ServicePriceBlock"],
  view_testimonials: ["TestimonialBlock"],
  subscribe_newsletter: ["NewsletterFormBlock"],
  general_info: ["WhyChooseUsBlock"],
};

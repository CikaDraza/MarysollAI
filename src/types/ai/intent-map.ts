// src/lib/ai/intent-map.ts

import { BlockTypes } from "../landing-block";

export type UserIntent =
  | "book_appointment"
  | "view_prices"
  | "view_testimonials"
  | "subscribe_newsletter"
  | "general_info";

export const INTENT_BLOCK_MAP: Record<UserIntent, BlockTypes[]> = {
  book_appointment: ["AuthBlock", "AppointmentCalendarBlock"],
  view_prices: ["ServicePriceBlock"],
  view_testimonials: ["TestimonialBlock"],
  subscribe_newsletter: ["NewsletterFormBlock"],
  general_info: ["WhyChooseUsBlock"],
};

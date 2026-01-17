// models/NewsletterCampaign.ts

import { INewsletterCampaign } from "@/types";
import { Schema, model, models } from "mongoose";

const newsletterCampaignSchema = new Schema<INewsletterCampaign>(
  {
    name: { type: String, required: true },
    subject: { type: String, required: true },
    campaignType: {
      type: String,
      enum: ["email-only", "email-landing"],
      default: "email-only",
    },
    landingPage: {
      layout: {
        type: [Schema.Types.Mixed],
        default: [],
      },
      semanticType: {
        type: String,
      },
      enabled: { type: Boolean, default: false },
      slug: {
        type: String,
        set: (value: string) => {
          if (!value) return value;
          const trimmed = value.trim();
          const normalized = trimmed.replace(/^\/+/, "/");
          return normalized.startsWith("/") ? normalized : `/${normalized}`;
        },
      },
      status: {
        type: String,
        enum: ["pending", "generated", "published", "failed"],
        default: "pending",
      },
      generatedAt: { type: Date },
      regeneratedCount: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export const NewsletterCampaign =
  models.NewsletterCampaign ||
  model<INewsletterCampaign>("NewsletterCampaign", newsletterCampaignSchema);

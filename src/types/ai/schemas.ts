// src/lib/ai/schemas.ts
import { Schema, SchemaType } from "@google/generative-ai";

const blockEnum = [
  "AuthBlock",
  "LoginBlock",
  "RegisterBlock",
  "ResetPasswordBlock",
  "ForgotPasswordBlock",
  "AppointmentBlock",
  "AppointmentCalendarBlock",
  "ServicesBlock",
  "ServicePriceBlock",
  "TestimonialBlock",
  "NewsletterFormBlock",
  "WhyChooseUsBlock",
];

export const layoutSuggestionSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    type: {
      type: SchemaType.STRING,
      enum: ["layout_suggestion"],
      format: "enum",
    },
    intent: { type: SchemaType.STRING },
    blocks: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: {
            type: SchemaType.STRING,
            enum: blockEnum,
            format: "enum",
          },
          priority: { type: SchemaType.NUMBER },
          metadata: {
            type: SchemaType.OBJECT,
            properties: {
              preselectedServiceId: { type: SchemaType.STRING },
              preselectedDate: { type: SchemaType.STRING },
            },
          },
        },
        required: ["type", "priority"],
      },
    },
  },
  required: ["type", "intent", "blocks"],
};

export const conversationSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    messages: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          content: { type: SchemaType.STRING },
          attachToBlockType: {
            type: SchemaType.STRING,
            enum: blockEnum,
            format: "enum",
          },
        },
        required: ["content"],
      },
    },
  },
  required: ["messages"],
};

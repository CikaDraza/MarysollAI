// src/lib/ai/schemas.ts
import { Schema, SchemaType } from "@google/generative-ai";

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
            enum: [
              "LoginBlock",
              "RegisterBlock",
              "AppointmentBlock",
              "AppointmentCalendarBlock",
              "ServicesBlock",
              "ServicePriceBlock",
              "TestimonialBlock",
              "NewsletterFormBlock",
              "WhyChooseUsBlock",
            ],
            format: "enum",
          },
          priority: { type: SchemaType.NUMBER },
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
            enum: ["general", "AppointmentBlock", "ServicePriceBlock"],
            format: "enum",
          },
        },
        required: ["content"],
      },
    },
  },
  required: ["messages"],
};

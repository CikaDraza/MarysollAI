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

// src/lib/ai/schemas.ts
export const unifiedSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    messages: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          content: { type: SchemaType.STRING },
          role: {
            type: SchemaType.STRING,
            enum: ["assistant"],
            format: "enum",
          },
          // Pomaže nam da znamo uz koji blok ide tekst
          attachToBlockType: {
            type: SchemaType.STRING,
            enum: ["none", ...blockEnum],
            format: "enum",
          },
        },
        required: ["content", "role", "attachToBlockType"],
      },
    },
    layout: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: { type: SchemaType.STRING, enum: blockEnum, format: "enum" },
          priority: { type: SchemaType.NUMBER },
          query: {
            type: SchemaType.STRING,
            description:
              "Search term for services, e.g., 'gel lak' or 'manikir' or 'šminkanje'",
          },
          metadata: {
            type: SchemaType.OBJECT,
            properties: {
              serviceId: { type: SchemaType.STRING },
              serviceName: { type: SchemaType.STRING },
              variantName: { type: SchemaType.STRING },
              date: {
                type: SchemaType.STRING,
                description: "ISO format date YYYY-MM-DD",
              },
              mode: {
                type: SchemaType.STRING,
                enum: ["login", "register", "forgot", "reset"], // Zaključane opcije
                description: "Selection of auth mode based on user intent",
                format: "enum",
              },
              time: { type: SchemaType.STRING, description: "HH:mm format" },
            },
          },
        },
        required: ["type", "priority"],
      },
    },
  },
  required: ["messages", "layout"],
};

// src/lib/ai/schemas.ts
import { Schema, SchemaType } from "@google/generative-ai";

const blockEnum = [
  "AuthBlock",
  "LoginBlock",
  "RegisterBlock",
  "ResetPasswordBlock",
  "ForgotPasswordBlock",
  "AppointmentBlock",
  "CalendarBlock",
  "AppointmentCalendarBlock",
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
          attachToBlockType: {
            type: SchemaType.STRING,
            enum: [...blockEnum, "none"],
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
              serviceName: {
                type: SchemaType.STRING,
                description:
                  "REQUIRED. The main name of the service from the knowledge base. Example: 'Gel lak'.",
              },
              variantName: {
                type: SchemaType.STRING,
                description:
                  "OPTIONAL. Only if a specific variant or size is chosen. Otherwise empty string.",
              },
              time: { type: SchemaType.STRING, description: "HH:mm format" },
              date: {
                type: SchemaType.STRING,
                description: "ISO format date YYYY-MM-DD",
              },
              mode: {
                type: SchemaType.STRING,
                enum: [
                  "login",
                  "register",
                  "forgot",
                  "reset",
                  "preview",
                  "list",
                ],
                description:
                  "Mode for AuthBlock (login/register) or CalendarBlock (preview/list)",
                format: "enum",
              },
            },
          },
        },
        required: ["type", "priority"],
      },
    },
  },
  required: ["messages", "layout"],
};

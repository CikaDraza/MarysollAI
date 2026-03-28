// src/lib/ai/schemas.ts

const blockEnum = [
  "AuthBlock",
  "LoginBlock",
  "LogoutBlock",
  "RegisterBlock",
  "ResetPasswordBlock",
  "ForgotPasswordBlock",
  "CalendarBlock",
  "AppointmentCalendarBlock",
  "ServicePriceBlock",
  "TestimonialBlock",
  "NewsletterFormBlock",
  "WhyChooseUsBlock",
];

// src/lib/ai/schemas.ts
export const unifiedSchema = {
  type: "object",
  properties: {
    messages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          content: { type: "string" },
          role: {
            type: "string",
            enum: ["assistant"],
          },
          attachToBlockType: {
            type: "string",
            enum: [...blockEnum, "none"],
          },
        },
        required: ["content", "role", "attachToBlockType"],
      },
    },
    layout: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: blockEnum },
          priority: { type: "number" },
          query: {
            type: "string",
            description:
              "Search term for services, e.g., 'gel lak' or 'manikir' or 'šminkanje'",
          },
          metadata: {
            type: "object",
            properties: {
              serviceId: { type: "string" },
              serviceName: {
                type: "string",
                description:
                  "REQUIRED. The main name of the service from the knowledge base. Example: 'Gel lak'.",
              },
              variantName: {
                type: "string",
                description:
                  "OPTIONAL. Only if a specific variant or size is chosen. Otherwise empty string.",
              },
              time: { type: "string", description: "HH:mm format" },
              date: {
                type: "string",
                description: "ISO format date YYYY-MM-DD",
              },
              mode: {
                type: "string",
                enum: [
                  "login",
                  "logout",
                  "register",
                  "forgot",
                  "reset",
                  "preview",
                  "list",
                ],
                description:
                  "Mode for AuthBlock (login/register) or CalendarBlock (preview/list)",
              },
            },
          },
        },
        required: ["type", "priority"],
      },
    },
  },
  required: ["messages", "layout"],
} as const;

// ✅ Export za DeepSeek response_format
export const deepseekResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "assistant_response",
    description: "AI assistant response with messages and layout blocks",
    schema: unifiedSchema,
    strict: true,
  },
} as const;

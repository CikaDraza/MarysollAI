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
  "AppointmentCancelConfirmBlock",
  "ServicePriceBlock",
  "TestimonialBlock",
  "NewsletterFormBlock",
  "WhyChooseUsBlock",
  "CityListBlock",
  "SalonListBlock",
] as const;

export const unifiedSchema = {
  type: "object",
  properties: {
    intent: {
      type: "object",
      properties: {
        city: { type: "string" },
        category: { type: "string" },
        service: { type: "string" },
        date: { type: "string" },
        time: { type: "string" },
        timeWindowStart: { type: "number" },
        timeWindowEnd: { type: "number" },
        confidence: { type: "number" },
      },
    },
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
            description: "Search term for services, e.g. 'gel lak' or 'šminkanje'",
          },
          metadata: {
            type: "object",
            properties: {
              serviceId: { type: "string" },
              serviceName: {
                type: "string",
                description: "Main service name from the knowledge base. Example: 'Gel lak'.",
              },
              variantName: {
                type: "string",
                description: "Specific variant or size, empty string if not applicable.",
              },
              time: { type: "string", description: "HH:mm format" },
              date: { type: "string", description: "ISO format YYYY-MM-DD" },
              mode: {
                type: "string",
                enum: ["login", "logout", "register", "forgot", "reset", "preview", "list"],
              },
              appointmentListMode: {
                type: "string",
                enum: ["all", "can_cancel"],
              },
              appointmentId: { type: "string" },
              service: { type: "string" },
              city: { type: "string" },
              cities: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    salonCount: { type: "number" },
                  },
                  required: ["name"],
                },
              },
              salons: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    address: { type: "string" },
                    rating: { type: "number" },
                    reviewCount: { type: "number" },
                    verified: { type: "boolean" },
                  },
                  required: ["id", "name"],
                },
              },
            },
          },
        },
        required: ["type", "priority"],
      },
    },
    // Tracks the active workflow so the frontend can route follow-up messages correctly
    workflow: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          enum: ["maria", "booking", "calendar", "auth"],
        },
        step: { type: "string" },
        completed: { type: "boolean" },
      },
    },
    // Declarative UI commands — show/hide blocks, scroll, focus
    ui: {
      type: "object",
      properties: {
        focusBlock: { type: "string" },
        hideBlocks: { type: "array", items: { type: "string" } },
        showBlocks: { type: "array", items: { type: "string" } },
        scrollTo: { type: "string" },
      },
    },
    // Pre-filled booking form payload — AI assisted form filling
    submitPayload: {
      type: "object",
      properties: {
        serviceId: { type: "string" },
        variantName: { type: "string" },
        date: { type: "string" },
        time: { type: "string" },
        clientName: { type: "string" },
        phone: { type: "string" },
      },
    },
  },
  required: ["messages", "layout"],
};

export const deepseekResponseFormat = {
  type: "json_schema" as const,
  json_schema: {
    name: "assistant_response",
    description: "AI assistant structured response with messages, layout blocks, and workflow state",
    schema: unifiedSchema,
  },
};

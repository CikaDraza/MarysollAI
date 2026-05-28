import { z } from "zod";
import type { RecoveryEvent } from "@/lib/ai/recovery/recovery-types";

export type UserMessageEvent = {
  type: "user_message";
  content: string;
  visibleInThread: true;
  timestamp: number;
};

export const SystemActionSourceSchema = z.enum([
  "QuickAccess",
  "BookingWidget",
  "BookingModal",
  "AuthBlock",
  "CalendarBlock",
  "NotifyMeBlock",
  "LayoutEngine",
  "AgentBridge",
  "Unknown",
]);

export const SystemActionNameSchema = z.enum([
  "SLOT_SELECTED",
  "CITY_SELECTED",
  "SALON_SELECTED",
  "SERVICE_SELECTED_FOR_SALON",
  "BOOKING_MODAL_OPENED",
  "BOOKING_MODAL_CLOSED",
  "BOOKING_PAYLOAD_INCOMPLETE",
  "BOOKING_SUBMIT_STARTED",
  "BOOKING_SUBMIT_SUCCESS",
  "BOOKING_SUBMIT_FAILED",
  "BOOKING_CONFLICT",
  "LOGIN_SUCCESS",
  "LOGIN_REQUIRED",
  "AUTH_RESUME_BOOKING",
  "NOTIFY_ME_CREATED",
  "APPOINTMENT_CANCELLED",
  "APPOINTMENT_UPDATED",
]);

export const SystemActionEventSchema = z.object({
  type: z.literal("system_action"),
  actionId: z.string().optional(),
  action: SystemActionNameSchema,
  payload: z.record(z.string(), z.unknown()).optional(),
  displayMessage: z.string().optional(),
  source: SystemActionSourceSchema,
  notifyAgent: z.boolean().optional(),
  visibleInThread: z.literal(false),
  timestamp: z.number(),
});

export type SystemActionEvent = z.infer<typeof SystemActionEventSchema>;
export type SystemActionSource = z.infer<typeof SystemActionSourceSchema>;
export type SystemActionName = z.infer<typeof SystemActionNameSchema>;

export type WorkflowTransitionEvent = {
  type: "workflow_transition";
  from?: string;
  to: string;
  reason?: string;
  payload?: Record<string, unknown>;
  visibleInThread: false;
  timestamp: number;
};

export type UIInteractionEvent = {
  type: "ui_interaction";
  action: string;
  source: SystemActionSource;
  payload?: Record<string, unknown>;
  visibleInThread: false;
  timestamp: number;
};

export type AIResponseEvent = {
  type: "ai_response";
  content: string;
  visibleInThread: boolean;
  timestamp: number;
  attachToBlockType?: string;
};

export type ChatEvent =
  | UserMessageEvent
  | SystemActionEvent
  | WorkflowTransitionEvent
  | UIInteractionEvent
  | RecoveryEvent
  | AIResponseEvent;

export function isSystemActionEvent(event: unknown): event is SystemActionEvent {
  return SystemActionEventSchema.safeParse(event).success;
}

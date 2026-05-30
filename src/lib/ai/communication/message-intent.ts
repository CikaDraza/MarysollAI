export type MessageIntent =
  | "greeting"
  | "faq_answer"
  | "clarify"
  | "handoff_status"
  | "booking_status"
  | "selection_ack"
  | "recovery"
  | "success"
  | "error"
  | "thanks"
  | "unknown";

export interface VisibleAgentMessage {
  agent: "maria" | "claudia";
  intent: MessageIntent;
  text: string;
}

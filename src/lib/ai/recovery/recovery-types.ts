export type RecoveryReason =
  | "slot_taken"
  | "missing_salon"
  | "missing_start_time"
  | "missing_service"
  | "missing_contact"
  | "auth_required"
  | "booking_submit_failed"
  | "cancel_expired"
  | "no_slots"
  | "notify_created"
  | "unknown";

export type RecoverySeverity = "info" | "recoverable" | "blocking" | "fatal";

export interface RecoveryEvent {
  type: "recovery";
  reason: RecoveryReason;
  severity: RecoverySeverity;
  source:
    | "BookingModal"
    | "BookingWorkflow"
    | "SystemActionDispatcher"
    | "Claudia"
    | "AuthBlock"
    | "CalendarBlock"
    | "LayoutEngine"
    | "Unknown";
  payload?: Record<string, unknown>;
  notifyAgent?: boolean;
  visibleInThread: false;
  timestamp: number;
}

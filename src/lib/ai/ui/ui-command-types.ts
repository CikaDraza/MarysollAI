import type { BookingModalSlot } from "@/lib/booking/bookingPayload";
import type { BaseBlock } from "@/types/landing-block";

export type UISurface = "workspace" | "modal" | "drawer" | "toast" | "none";

export type BookingModalPayload = BookingModalSlot;

export type UICommand =
  | { type: "OPEN_DRAWER"; reason?: string }
  | { type: "CLOSE_DRAWER"; reason?: string }
  | {
      type: "OPEN_BOOKING_MODAL";
      payload: BookingModalPayload;
      reason?: string;
    }
  | { type: "CLOSE_BOOKING_MODAL"; reason?: string }
  | {
      type: "RENDER_BLOCK";
      block: BaseBlock;
      surface?: "workspace" | "drawer";
      reason?: string;
    }
  | { type: "FOCUS_BLOCK"; blockType: string; reason?: string }
  | { type: "CLEAR_WORKSPACE"; reason?: string }
  | {
      type: "SHOW_TOAST";
      message: string;
      variant: "success" | "error" | "info";
      reason?: string;
    };

/*
Surface ownership rules:

1. Booking modal is the only surface for final booking confirmation.
2. Workspace is the surface for interactive blocks:
   AppointmentCalendarBlock, CalendarBlock, ServicePriceBlock, SalonListBlock,
   CityListBlock, NotifyMeBlock.
3. Drawer is the conversation surface.
4. Toast is for short system feedback only.
5. Only one primary interactive surface may be active:
   - if OPEN_BOOKING_MODAL, workspace booking blocks should not also ask for confirmation;
   - if RENDER_BLOCK for booking selection, do not open modal until SLOT_SELECTED.
6. AI never opens UI directly. Orchestrator emits UICommand.

Task 5 enforces these softly with [SURFACE_OWNERSHIP] dev logs.
*/

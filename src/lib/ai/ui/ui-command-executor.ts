import { blockOrchestrator } from "@/lib/ai/block-orchestrator";
import type { UICommand, BookingModalPayload } from "@/lib/ai/ui/ui-command-types";

type UICommandListener = (command: UICommand) => void;

const listeners = new Set<UICommandListener>();
let modalSlotKey: string | null = null;
let drawerOpen = false;

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

function logCommand(command: UICommand, extra?: Record<string, unknown>): void {
  if (!isDev()) return;
  console.debug("[UI_COMMAND]", {
    type: command.type,
    reason: command.reason,
    ...extra,
  });
}

function logSurfaceOwnership(message: string, details?: Record<string, unknown>): void {
  if (!isDev()) return;
  console.debug("[SURFACE_OWNERSHIP]", { message, ...details });
}

function slotKey(slot: BookingModalPayload | undefined): string {
  if (!slot) return "";
  return [
    slot.salonId,
    slot.serviceId,
    slot.startTime,
    slot.date,
    slot.time ?? slot.timeLabel,
    slot.salonName,
    slot.serviceName,
  ]
    .filter(Boolean)
    .join("|");
}

function emit(command: UICommand): void {
  listeners.forEach((listener) => listener(command));
}

function applySoftOwnership(command: UICommand): UICommand {
  if (command.type === "OPEN_DRAWER") {
    if (drawerOpen) {
      logSurfaceOwnership("drawer_already_open", { reason: command.reason });
      return { type: "FOCUS_BLOCK", blockType: "AIDrawer", reason: "drawer_already_open" };
    }
    drawerOpen = true;
    return command;
  }

  if (command.type === "CLOSE_DRAWER") {
    drawerOpen = false;
    return command;
  }

  if (command.type === "OPEN_BOOKING_MODAL") {
    const nextKey = slotKey(command.payload);
    if (modalSlotKey && modalSlotKey === nextKey) {
      logSurfaceOwnership("booking_modal_duplicate_suppressed", {
        reason: command.reason,
        slotKey: nextKey,
      });
      return {
        type: "FOCUS_BLOCK",
        blockType: "BookingModal",
        reason: "booking_modal_duplicate_suppressed",
      };
    }
    modalSlotKey = nextKey;
    logSurfaceOwnership("booking_modal_owns_final_confirmation", {
      reason: command.reason,
      slotKey: nextKey,
    });
    return command;
  }

  if (command.type === "CLOSE_BOOKING_MODAL") {
    modalSlotKey = null;
    return command;
  }

  if (command.type === "RENDER_BLOCK") {
    if (command.block.type === "AppointmentCalendarBlock") {
      logSurfaceOwnership("workspace_renders_booking_selection_until_slot_selected", {
        blockType: command.block.type,
        surface: command.surface ?? "workspace",
      });
    }
    if (blockOrchestrator.isBlockOpen(command.block.type)) {
      logSurfaceOwnership("block_duplicate_focus_existing", {
        blockType: command.block.type,
      });
      blockOrchestrator.focusBlock(command.block.type);
      return {
        type: "FOCUS_BLOCK",
        blockType: command.block.type,
        reason: "duplicate_render_block",
      };
    }
  }

  if (command.type === "FOCUS_BLOCK") {
    blockOrchestrator.focusBlock(command.blockType);
  }

  return command;
}

export const uiCommandBus = {
  emit(command: UICommand): void {
    emit(command);
  },
  subscribe(listener: UICommandListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  resetForTests(): void {
    listeners.clear();
    modalSlotKey = null;
    drawerOpen = false;
  },
};

export function executeUICommand(command: UICommand): void {
  const routed = applySoftOwnership(command);
  logCommand(routed, {
    originalType: routed.type === command.type ? undefined : command.type,
  });
  emit(routed);
}

import type { ClaudiaContract } from "@/lib/ai/schemas/claudia-contract.schema";
import type { UICommand, BookingModalPayload } from "@/lib/ai/ui/ui-command-types";
import type { BaseBlock } from "@/types/landing-block";

function blockWithDefaults(block: Partial<BaseBlock> & { type: BaseBlock["type"] }): BaseBlock {
  return {
    priority: 1,
    metadata: {
      serviceId: "",
      serviceName: "",
      variantName: "",
      ...(block.metadata ?? {}),
    },
    ...block,
  } as unknown as BaseBlock;
}

function firstBlock(contract: ClaudiaContract): BaseBlock | null {
  const block = contract.ui.blocks[0];
  if (!block) return null;
  return blockWithDefaults(block as unknown as BaseBlock);
}

function blockFromEntities(
  type: BaseBlock["type"],
  contract: ClaudiaContract,
): BaseBlock {
  const entities = contract.intent.entities;
  return blockWithDefaults({
    type,
    metadata: {
      serviceId: entities.serviceId ?? "",
      serviceName: entities.serviceName ?? entities.service ?? "",
      variantName: "",
      service: entities.service,
      category: entities.category,
      subcategory: entities.subcategory,
      city: entities.requestedCity ?? entities.city,
      salonId: entities.salonId,
      salonName: entities.salonName,
      date: entities.date,
      time: entities.time,
      timeWindowStart: entities.timeWindowStart,
      timeWindowEnd: entities.timeWindowEnd,
      slots: (entities.slots ?? entities.alternatives) as BaseBlock["metadata"]["slots"],
      selectedSlot: entities.selectedSlot as BaseBlock["metadata"]["selectedSlot"],
      appointmentId: entities.appointmentId,
      appointment: entities.appointment as BaseBlock["metadata"]["appointment"],
      salons: entities.salons as BaseBlock["metadata"]["salons"],
    },
  });
}

function renderBlockCommand(block: BaseBlock, reason?: string): UICommand {
  return {
    type: "RENDER_BLOCK",
    block,
    surface: "workspace",
    reason,
  };
}

export function claudiaContractToUICommands(contract: ClaudiaContract): UICommand[] {
  const reason = contract.nextAction.reason ?? contract.workflow.step;
  const commands: UICommand[] = [];

  if (contract.kind === "recovery" && contract.workflow.step === "slot_taken") {
    commands.push({ type: "OPEN_DRAWER", reason: "slot_taken_recovery" });
  }

  switch (contract.nextAction.type) {
    case "SHOW_SLOTS": {
      commands.push(
        renderBlockCommand(
          firstBlock(contract) ?? blockFromEntities("AppointmentCalendarBlock", contract),
          reason,
        ),
      );
      break;
    }
    case "OPEN_BOOKING_MODAL": {
      const selectedSlot = contract.intent.entities.selectedSlot;
      if (selectedSlot && typeof selectedSlot === "object") {
        commands.push({
          type: "OPEN_BOOKING_MODAL",
          payload: selectedSlot as BookingModalPayload,
          reason,
        });
      }
      break;
    }
    case "SHOW_APPOINTMENTS":
      commands.push(
        renderBlockCommand(firstBlock(contract) ?? blockFromEntities("CalendarBlock", contract), reason),
      );
      break;
    case "SHOW_PRICES": {
      const block =
        firstBlock(contract) ??
        blockFromEntities(
          contract.intent.entities.salonId || contract.intent.entities.salonName
            ? "ServicePriceBlock"
            : "SalonListBlock",
          contract,
        );
      commands.push(renderBlockCommand(block, reason));
      break;
    }
    case "SHOW_SALONS":
      commands.push(
        renderBlockCommand(firstBlock(contract) ?? blockFromEntities("SalonListBlock", contract), reason),
      );
      break;
    case "SHOW_AUTH":
      commands.push(
        renderBlockCommand(firstBlock(contract) ?? blockFromEntities("AuthBlock", contract), reason),
      );
      break;
    case "SHOW_RECOVERY_ALTERNATIVES": {
      const block = firstBlock(contract) ?? blockFromEntities("AppointmentCalendarBlock", contract);
      if (block.metadata?.slots && Array.isArray(block.metadata.slots) && block.metadata.slots.length > 0) {
        commands.push(renderBlockCommand(block, reason));
      }
      break;
    }
    case "SHOW_CANCEL_CONFIRMATION":
      commands.push(
        renderBlockCommand(
          firstBlock(contract) ?? blockFromEntities("AppointmentCancelConfirmBlock", contract),
          reason,
        ),
      );
      break;
    case "SHOW_UPDATE_CONFIRMATION":
      commands.push(
        renderBlockCommand(
          firstBlock(contract) ?? blockFromEntities("AppointmentUpdateConfirmBlock", contract),
          reason,
        ),
      );
      break;
    case "OFFER_NOTIFY_ME":
      commands.push(
        renderBlockCommand(firstBlock(contract) ?? blockFromEntities("NotifyMeBlock", contract), reason),
      );
      break;
    case "ASK_CLARIFICATION":
    case "NONE":
      break;
  }

  return commands;
}

// src/components/layout/blockFactory.tsx
import {
  AppointmentCalendarBlockType,
  AuthBlockType,
  BaseBlock,
  CalendarBlockType,
  PricingBlockType,
} from "@/types/landing-block";
import { AuthBlockView } from "../blocks/AuthBlockView";
import PricingBlockView from "../blocks/PricingBlockView";
import AppointmentCalendarBlockView from "../blocks/AppointmentCalendarBlockView";
import { CalendarBlockView } from "../blocks/CalendarBlockView";

export function blockFactory(
  block: BaseBlock,
  onMessageAction?: (m: string) => void,
) {
  const safeOnAction =
    onMessageAction ||
    ((m: string) => console.warn("No action handler for:", m));

  switch (block.type) {
    case "AuthBlock":
      return (
        <AuthBlockView
          key={block.id}
          block={block as AuthBlockType}
          onActionComplete={onMessageAction}
        />
      );
    case "ServicePriceBlock":
      return (
        <PricingBlockView key={block.id} block={block as PricingBlockType} />
      );
    case "AppointmentCalendarBlock":
      return (
        <AppointmentCalendarBlockView
          key={block.id}
          block={block as AppointmentCalendarBlockType}
          onActionComplete={onMessageAction}
        />
      );
    case "CalendarBlock":
      return (
        <CalendarBlockView
          key={block.id}
          block={block as CalendarBlockType}
          onAction={safeOnAction}
        />
      );
    default:
      console.warn("Factory: Unknown block type", block.type);
      return null;
  }
}

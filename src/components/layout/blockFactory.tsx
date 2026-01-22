// src/components/layout/blockFactory.tsx
import {
  AnyBlock,
  AppointmentCalendarBlockType,
  AuthBlockType,
  BaseBlock,
  PricingBlockType,
} from "@/types/landing-block";
import { AuthBlockView } from "../blocks/AuthBlockView";
import PricingBlockView from "../blocks/PricingBlockView";
import AppointmentCalendarBlockView from "../blocks/AppointmentCalendarBlockView";

export function blockFactory(block: BaseBlock, onAction?: (m: string) => void) {
  const b = block as AnyBlock;
  switch (b.type) {
    case "AuthBlock":
      return (
        <AuthBlockView
          key={b.id}
          block={b as AuthBlockType}
          onActionComplete={onAction}
        />
      );
    case "ServicePriceBlock":
      return <PricingBlockView key={b.id} block={b as PricingBlockType} />;
    case "AppointmentCalendarBlock":
      return (
        <AppointmentCalendarBlockView
          key={b.id}
          block={b as AppointmentCalendarBlockType}
        />
      );
    default:
      console.warn("Factory: Unknown block type", b.type);
      return null;
  }
}

// src/components/layout/blockFactory.tsx
import {
  AppointmentCalendarBlockType,
  AuthBlockType,
  BaseBlock,
  CalendarBlockType,
  CityListBlockType,
  PricingBlockType,
  SalonListBlockType,
} from "@/types/landing-block";
import { AuthBlockView } from "../blocks/AuthBlockView";
import PricingBlockView from "../blocks/PricingBlockView";
import AppointmentCalendarBlockView from "../blocks/AppointmentCalendarBlockView";
import { CalendarBlockView } from "../blocks/CalendarBlockView";
import TestimonialBlockView from "../blocks/TestimonialBlockView";
import CityListBlockView from "../blocks/CityListBlockView";
import SalonListBlockView from "../blocks/SalonListBlockView";
import LandingSearchBlock from "../blocks/LandingSearchBlock";
import LandingConfirmBlock from "../blocks/LandingConfirmBlock";

export function blockFactory(
  block: BaseBlock,
  onMessageAction?: (m: string) => void,
  isLanding?: boolean,
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
          onActionComplete={safeOnAction}
        />
      );
    case "ServicePriceBlock":
      return (
        <PricingBlockView key={block.id} block={block as PricingBlockType} />
      );
    case "AppointmentCalendarBlock":
      if (isLanding && block.metadata.time) {
        return (
          <LandingConfirmBlock
            key={block.id}
            block={block as AppointmentCalendarBlockType}
          />
        );
      }
      if (isLanding) {
        return (
          <LandingSearchBlock
            key={block.id}
            block={block}
            onActionComplete={safeOnAction}
          />
        );
      }
      return (
        <AppointmentCalendarBlockView
          key={block.id}
          block={block as AppointmentCalendarBlockType}
          onActionComplete={safeOnAction}
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
    case "TestimonialBlock":
      return (
        <TestimonialBlockView key={block.id} onActionComplete={safeOnAction} />
      );
    case "CityListBlock":
      return (
        <CityListBlockView
          key={block.id}
          block={block as CityListBlockType}
          onActionComplete={safeOnAction}
        />
      );
    case "SalonListBlock":
      return (
        <SalonListBlockView
          key={block.id}
          block={block as SalonListBlockType}
          onActionComplete={safeOnAction}
        />
      );
    default:
      console.warn("Factory: Unknown block type", block.type);
      return null;
  }
}

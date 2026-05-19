// src/components/layout/blockFactory.tsx
import {
  AppointmentCalendarBlockType,
  AppointmentCancelConfirmBlockType,
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
import AppointmentCancelConfirmBlockView from "../blocks/AppointmentCancelConfirmBlockView";
import ArticleSectionBlockView from "../blocks/ArticleSectionBlockView";
import FeatureGridBlockView from "../blocks/FeatureGridBlockView";
import HeroPrimaryBlockView from "../blocks/HeroPrimaryBlockView";
import HeroVisualBlockView from "../blocks/HeroVisualBlockView";
import { ContentSplitBlockView } from "../blocks/ContentSplitBlockView";
import { CTABlockView } from "../blocks/CTABlockView";
import {
  getBlockRegistryEntry,
  isAIWorkflowBlock,
  isContentBlock,
} from "@/lib/ai/layout/block-registry";

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

function warnLegacyAction(block: BaseBlock, message: string): void {
  if (!isDev()) return;
  console.warn("[BLOCK_LEGACY_ACTION]", {
    type: block.type,
    message,
  });
}

export function blockFactory(
  block: BaseBlock,
  onMessageAction?: (m: string, payload?: Record<string, unknown>) => void,
  isLanding?: boolean,
) {
  const entry = getBlockRegistryEntry(block.type);
  if (isAIWorkflowBlock(block.type)) {
    return aiWorkflowBlockFactory(block, onMessageAction, isLanding);
  }
  if (isContentBlock(block.type)) {
    return contentBlockFactory(block);
  }

  if (isDev()) {
    console.warn("Factory: Unknown block type", {
      type: block.type,
      kind: entry?.kind,
    });
  }
  return null;
}

export function aiWorkflowBlockFactory(
  block: BaseBlock,
  onMessageAction?: (m: string, payload?: Record<string, unknown>) => void,
  isLanding?: boolean,
) {
  const safeOnAction = (message: string, payload?: Record<string, unknown>) => {
    warnLegacyAction(block, message);
    onMessageAction?.(message, payload);
  };
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
    case "AppointmentCancelConfirmBlock":
      return (
        <AppointmentCancelConfirmBlockView
          key={block.id}
          block={block as AppointmentCancelConfirmBlockType}
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
      if (isDev()) console.warn("Factory: Unknown AI workflow block type", block.type);
      return null;
  }
}

export function contentBlockFactory(block: BaseBlock) {
  switch (block.type) {
    case "HeroPrimaryBlock":
      return <HeroPrimaryBlockView key={block.id} block={block as never} />;
    case "HeroVisualBlock":
      return <HeroVisualBlockView key={block.id} block={block as never} />;
    case "ArticleSectionBlock":
      return <ArticleSectionBlockView key={block.id} block={block as never} />;
    case "FeatureGridBlock":
      return <FeatureGridBlockView key={block.id} block={block as never} />;
    case "ContentSplitBlock":
      return <ContentSplitBlockView key={block.id} block={block as never} />;
    case "CTABlock":
      return <CTABlockView key={block.id} block={block as never} />;
    default:
      if (isDev()) console.warn("Factory: Unknown content block type", block.type);
      return null;
  }
}

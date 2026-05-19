import type { BlockTypes } from "@/types/landing-block";

export type BlockKind = "ai_workflow" | "content";
export type BlockSurface = "workspace" | "drawer";

export interface BlockRegistryEntry {
  type: BlockTypes;
  kind: BlockKind;
  requiresAuth?: boolean;
  interactive: boolean;
  emitsSystemActions: boolean;
  allowedSurfaces: BlockSurface[];
}

const workspaceAndDrawer: BlockSurface[] = ["workspace", "drawer"];

export const AI_WORKFLOW_BLOCK_REGISTRY = {
  AuthBlock: {
    type: "AuthBlock",
    kind: "ai_workflow",
    requiresAuth: false,
    interactive: true,
    emitsSystemActions: true,
    allowedSurfaces: workspaceAndDrawer,
  },
  LoginBlock: {
    type: "LoginBlock",
    kind: "ai_workflow",
    interactive: true,
    emitsSystemActions: true,
    allowedSurfaces: workspaceAndDrawer,
  },
  LogoutBlock: {
    type: "LogoutBlock",
    kind: "ai_workflow",
    interactive: true,
    emitsSystemActions: false,
    allowedSurfaces: workspaceAndDrawer,
  },
  RegisterBlock: {
    type: "RegisterBlock",
    kind: "ai_workflow",
    interactive: true,
    emitsSystemActions: false,
    allowedSurfaces: workspaceAndDrawer,
  },
  ResetPasswordBlock: {
    type: "ResetPasswordBlock",
    kind: "ai_workflow",
    interactive: true,
    emitsSystemActions: false,
    allowedSurfaces: workspaceAndDrawer,
  },
  ForgotPasswordBlock: {
    type: "ForgotPasswordBlock",
    kind: "ai_workflow",
    interactive: true,
    emitsSystemActions: false,
    allowedSurfaces: workspaceAndDrawer,
  },
  CalendarBlock: {
    type: "CalendarBlock",
    kind: "ai_workflow",
    requiresAuth: true,
    interactive: true,
    emitsSystemActions: false,
    allowedSurfaces: workspaceAndDrawer,
  },
  AppointmentCalendarBlock: {
    type: "AppointmentCalendarBlock",
    kind: "ai_workflow",
    interactive: true,
    emitsSystemActions: true,
    allowedSurfaces: workspaceAndDrawer,
  },
  AppointmentCancelConfirmBlock: {
    type: "AppointmentCancelConfirmBlock",
    kind: "ai_workflow",
    requiresAuth: true,
    interactive: true,
    emitsSystemActions: false,
    allowedSurfaces: workspaceAndDrawer,
  },
  ServicePriceBlock: {
    type: "ServicePriceBlock",
    kind: "ai_workflow",
    interactive: true,
    emitsSystemActions: false,
    allowedSurfaces: workspaceAndDrawer,
  },
  TestimonialBlock: {
    type: "TestimonialBlock",
    kind: "ai_workflow",
    interactive: true,
    emitsSystemActions: false,
    allowedSurfaces: workspaceAndDrawer,
  },
  CityListBlock: {
    type: "CityListBlock",
    kind: "ai_workflow",
    interactive: true,
    emitsSystemActions: true,
    allowedSurfaces: workspaceAndDrawer,
  },
  SalonListBlock: {
    type: "SalonListBlock",
    kind: "ai_workflow",
    interactive: true,
    emitsSystemActions: true,
    allowedSurfaces: workspaceAndDrawer,
  },
  NotifyMeBlock: {
    type: "NotifyMeBlock",
    kind: "ai_workflow",
    interactive: true,
    emitsSystemActions: true,
    allowedSurfaces: workspaceAndDrawer,
  },
} satisfies Partial<Record<BlockTypes, BlockRegistryEntry>>;

export const CONTENT_BLOCK_REGISTRY = {
  HeroPrimaryBlock: {
    type: "HeroPrimaryBlock",
    kind: "content",
    interactive: false,
    emitsSystemActions: false,
    allowedSurfaces: ["workspace"],
  },
  HeroVisualBlock: {
    type: "HeroVisualBlock",
    kind: "content",
    interactive: false,
    emitsSystemActions: false,
    allowedSurfaces: ["workspace"],
  },
  ArticleSectionBlock: {
    type: "ArticleSectionBlock",
    kind: "content",
    interactive: false,
    emitsSystemActions: false,
    allowedSurfaces: ["workspace"],
  },
  ContentSplitBlock: {
    type: "ContentSplitBlock",
    kind: "content",
    interactive: false,
    emitsSystemActions: false,
    allowedSurfaces: ["workspace"],
  },
  CTABlock: {
    type: "CTABlock",
    kind: "content",
    interactive: true,
    emitsSystemActions: false,
    allowedSurfaces: ["workspace"],
  },
  FeatureGridBlock: {
    type: "FeatureGridBlock",
    kind: "content",
    interactive: false,
    emitsSystemActions: false,
    allowedSurfaces: ["workspace"],
  },
  NewsletterFormBlock: {
    type: "NewsletterFormBlock",
    kind: "content",
    interactive: true,
    emitsSystemActions: false,
    allowedSurfaces: ["workspace"],
  },
  WhyChooseUsBlock: {
    type: "WhyChooseUsBlock",
    kind: "content",
    interactive: false,
    emitsSystemActions: false,
    allowedSurfaces: ["workspace"],
  },
} satisfies Partial<Record<BlockTypes, BlockRegistryEntry>>;

export const BLOCK_REGISTRY = {
  ...AI_WORKFLOW_BLOCK_REGISTRY,
  ...CONTENT_BLOCK_REGISTRY,
} satisfies Partial<Record<BlockTypes, BlockRegistryEntry>>;

export function getBlockRegistryEntry(type: string): BlockRegistryEntry | undefined {
  return (BLOCK_REGISTRY as Partial<Record<string, BlockRegistryEntry>>)[type];
}

export function isAIWorkflowBlock(type: string): boolean {
  return getBlockRegistryEntry(type)?.kind === "ai_workflow";
}

export function isContentBlock(type: string): boolean {
  return getBlockRegistryEntry(type)?.kind === "content";
}

export function canRenderBlockOnSurface(type: string, surface: BlockSurface): boolean {
  return getBlockRegistryEntry(type)?.allowedSurfaces.includes(surface) ?? false;
}

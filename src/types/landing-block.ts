// src/types/landing-block.ts

export type BlockTypes =
  | "ServicePriceBlock"
  | "AuthBlock"
  | "PricingBlock"
  | "ServicesBlock"
  | "AppointmentBlock"
  | "AppointmentCalendarBlock"
  | "NewsletterFormBlock"
  | "LoginBlock"
  | "RegisterBlock"
  | "ForgotPasswordBlock"
  | "ResetPasswordBlock"
  | "TestimonialBlock"
  | "WhyChooseUsBlock";

export interface BaseBlock {
  id: string;
  type: BlockTypes;
  priority: number;
}

export interface LoginBlockType extends BaseBlock {
  type: "LoginBlock";
  password: string;
  email: string;
  onSwitchRegister: () => void;
}

export interface RegisterBlockType extends BaseBlock {
  type: "RegisterBlock";
  name: string;
  email: string;
  phone: string;
  agree: boolean;
  onSwitchLogin: () => void;
}

export interface ForgotPasswordBlockType extends BaseBlock {
  type: "ForgotPasswordBlock";
  email: string;
  message?: string;
  onSwitchLogin: () => void;
}

export interface ResetPasswordBlockType extends BaseBlock {
  type: "ResetPasswordBlock";
  password: string;
  message?: string;
  token?: string;
  onSwitchLogin: () => void;
}

export interface AuthBlockType extends BaseBlock {
  type: "AuthBlock";
  defaultEmail: string;
}

export interface PricingBlockType extends BaseBlock {
  type: "ServicePriceBlock";
  query: string;
}

export interface AppointmentCalendarBlockType extends BaseBlock {
  type: "AppointmentCalendarBlock";
  metadata: {
    properties: {
      serviceId: string;
      serviceName: string;
      date: string;
      time: string;
    };
  };
  selectedServiceId?: string; // Može doći iz AI agenta
  selectedServiceName?: string;
}

export type AnyBlock = PricingBlockType | AuthBlockType | BaseBlock;

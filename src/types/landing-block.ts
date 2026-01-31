// src/types/landing-block.ts

export type BlockTypes =
  | "ServicePriceBlock"
  | "AuthBlock"
  | "PricingBlock"
  | "ServicesBlock"
  | "AppointmentBlock"
  | "AppointmentCalendarBlock"
  | "CalendarBlock"
  | "NewsletterFormBlock"
  | "LoginBlock"
  | "RegisterBlock"
  | "ForgotPasswordBlock"
  | "ResetPasswordBlock"
  | "TestimonialBlock"
  | "WhyChooseUsBlock"
  | "none";

export type AuthMode = "login" | "register" | "forgot" | "reset";
export type CalendarMode = "preview" | "list";

export interface BaseBlock {
  id: string;
  type: BlockTypes;
  priority: number;
  metadata: {
    serviceId: string;
    serviceName: string;
    variantName: string;
    date?: string;
    time?: string;
    mode?: AuthMode | CalendarMode;
  };
  query?: string;
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

export interface CalendarBlockType extends BaseBlock {
  type: "CalendarBlock";
  metadata: {
    serviceId: string;
    serviceName: string;
    variantName: string;
    date?: string;
    time?: string;
    mode?: CalendarMode;
  };
  query?: string;
}

export interface PricingBlockType extends BaseBlock {
  type: "ServicePriceBlock";
  query?: string;
}

export interface AppointmentCalendarBlockType extends BaseBlock {
  type: "AppointmentCalendarBlock";
  metadata: {
    serviceId: string;
    serviceName: string;
    variantName: string;
    date?: string;
    time?: string;
  };
  query?: string;
  selectedServiceId?: string; // Može doći iz AI agenta
  selectedServiceName?: string;
}

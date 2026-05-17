// src/types/landing-block.ts
import type { SearchResult } from "@/types/slots";
import type { IAppointment } from "@/types/appointments-type";
import type { AppointmentListMode } from "@/lib/appointments/appointmentFilters";

export type BlockTypes =
  | "AuthBlock"
  | "ServicePriceBlock"
  | "AppointmentCalendarBlock"
  | "AppointmentCancelConfirmBlock"
  | "CalendarBlock"
  | "NewsletterFormBlock"
  | "LoginBlock"
  | "LogoutBlock"
  | "RegisterBlock"
  | "ForgotPasswordBlock"
  | "ResetPasswordBlock"
  | "TestimonialBlock"
  | "WhyChooseUsBlock"
  | "CityListBlock"
  | "SalonListBlock"
  | "none";

export type AuthMode = "login" | "register" | "forgot" | "reset" | "logout";
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
    appointmentListMode?: AppointmentListMode;
    intent?: string;
    category?: string;
    subcategory?: string;
    service?: string;
    city?: string;
    salonId?: string;
    salonName?: string;
    timeWindowStart?: number | null;
    timeWindowEnd?: number | null;
    slots?: SearchResult[];
    price?: number;
    duration?: number;
    clientName?: string;
    clientPhone?: string;
    instagram?: string;
    contact?: unknown;
    selectedSlot?: SearchResult;
    appointmentId?: string;
    appointment?: IAppointment;
  };
  query?: string;
}

export interface LoginBlockType extends BaseBlock {
  type: "LoginBlock";
  password: string;
  email: string;
  onSwitchRegister: () => void;
}

export interface LogoutBlockType extends BaseBlock {
  type: "LogoutBlock";
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
  metadata: BaseBlock["metadata"] & {
    mode?: AuthMode;
    selectedSlot?: SearchResult;
  };
  defaultEmail: string;
}

export interface CalendarBlockType extends BaseBlock {
  type: "CalendarBlock";
  metadata: BaseBlock["metadata"] & {
    mode?: CalendarMode;
    appointmentListMode?: AppointmentListMode;
  };
  query?: string;
}

export interface AppointmentCancelConfirmBlockType extends BaseBlock {
  type: "AppointmentCancelConfirmBlock";
  metadata: BaseBlock["metadata"] & {
    appointmentId: string;
    appointment: IAppointment;
  };
}

export interface PricingBlockType extends BaseBlock {
  type: "ServicePriceBlock";
  query?: string;
  metadata: BaseBlock["metadata"] & {
    salonId?: string;
    salonName?: string;
    service?: string;
  };
}

export interface TestimonialBlockType extends BaseBlock {
  type: "TestimonialBlock";
}

export interface AppointmentCalendarBlockType extends BaseBlock {
  type: "AppointmentCalendarBlock";
  metadata: {
    serviceId: string;
    serviceName: string;
    variantName: string;
    date?: string;
    time?: string;
    service?: string;
    category?: string;
    subcategory?: string;
    city?: string;
    salonId?: string;
    salonName?: string;
    timeWindowStart?: number | null;
    timeWindowEnd?: number | null;
    slots?: SearchResult[];
    price?: number;
    duration?: number;
    clientName?: string;
    clientPhone?: string;
    instagram?: string;
    contact?: unknown;
  };
  query?: string;
  selectedServiceId?: string;
  selectedServiceName?: string;
}

export interface CityItem {
  name: string;
  salonCount?: number;
}

export interface CityListBlockType extends BaseBlock {
  type: "CityListBlock";
  metadata: BaseBlock["metadata"] & {
    service?: string;
    cities: CityItem[];
  };
}

export interface SalonItem {
  id: string;
  name: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  verified?: boolean;
}

export interface SalonListBlockType extends BaseBlock {
  type: "SalonListBlock";
  metadata: BaseBlock["metadata"] & {
    city: string;
    service?: string;
    salons: SalonItem[];
  };
}

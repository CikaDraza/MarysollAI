// src/types/block-type-map.ts
import {
  ServicePriceBlock,
  AuthBlock,
  ServicesBlock,
  AppointmentBlock,
  AppointmentCalendarBlock,
  NewsletterFormBlock,
  LoginBlock,
  RegisterBlock,
  TestimonialBlock,
  WhyChooseUsBlock,
} from "./block-instances";

export interface BlockTypeMap {
  ServicePriceBlock: ServicePriceBlock;
  AuthBlock: AuthBlock;
  ServicesBlock: ServicesBlock;
  AppointmentBlock: AppointmentBlock;
  AppointmentCalendarBlock: AppointmentCalendarBlock;
  NewsletterFormBlock: NewsletterFormBlock;
  LoginBlock: LoginBlock;
  RegisterBlock: RegisterBlock;
  TestimonialBlock: TestimonialBlock;
  WhyChooseUsBlock: WhyChooseUsBlock;
}

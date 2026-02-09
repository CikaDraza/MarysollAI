// src/types/block-type-map.ts
import {
  ServicePriceBlock,
  AuthBlock,
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
  AppointmentCalendarBlock: AppointmentCalendarBlock;
  NewsletterFormBlock: NewsletterFormBlock;
  LoginBlock: LoginBlock;
  RegisterBlock: RegisterBlock;
  TestimonialBlock: TestimonialBlock;
  WhyChooseUsBlock: WhyChooseUsBlock;
}

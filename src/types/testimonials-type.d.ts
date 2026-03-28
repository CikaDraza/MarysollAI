// src/types/testimonials-type.d.ts
import { PaginationInfo } from ".";

export interface ITestimonial<T = string> {
  _id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  appointmentId: T;
  rating: number;
  comment: string;
  adminReply?: string;
  isRead: boolean;
  isClientRead: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ITestimonialWithPopulatedAppointment extends ITestimonial {
  appointmentId: {
    _id: string;
    serviceName?: string;
    date?: string; // String za frontend
  };
}

export interface ITestimonialWithAppointmentId extends ITestimonial {
  appointmentId: string;
}

// Tipovi za API response (bez mongoose)
export interface CountResult {
  total: number;
}

export interface TestimonialsResponse {
  testimonials: ITestimonial<{
    _id: string;
    serviceName: string;
    date: string;
  }>[];
  pagination: PaginationInfo;
}

export interface CreateTestimonialData {
  appointmentId: string;
  rating: number;
  comment: string;
}

export interface UpdateTestimonialData {
  rating?: number;
  comment?: string;
  adminReply?: string;
}

// Tip za count result
export interface CountResult {
  total: number;
}

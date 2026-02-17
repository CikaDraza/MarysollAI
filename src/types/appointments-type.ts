// types/appointments-type.ts
export interface IAppointmentVariant {
  name: string;
  price: number;
  duration: number;
  perItem: boolean;
}

export interface IAppointmentExtra {
  name: string;
  price: number;
  duration: number;
  perItem: boolean;
}

export interface IAppointmentService {
  serviceId: string;
  serviceName?: string;
  variants?: IAppointmentVariant[];
  extras?: IAppointmentExtra[];
  quantity: number;
  price: number;
  duration: number;
}

export interface IMessage {
  _id: string;
  sender: "client" | "admin";
  message: string;
  timestamp: Date;
}

export interface IAppointment {
  _id?: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  serviceName: string;
  services: IAppointmentService[];
  duration: number;
  date: string;
  time: string;
  note?: string;
  status:
    | "pending"
    | "appointment_approved"
    | "appointment_rejected"
    | "appointment_rescheduled"
    | "appointment_cancelled";
  messages: IMessage[];
  adminNotified: boolean;
  clientNotified: boolean;
  proposedDate?: string;
  proposedTime?: string;
  lastUpdatedBy?: "client" | "admin";
  createdAt?: string | Date;
  updatedAt?: string | Date;
  unreadCount?: {
    client: number | null;
    admin: number | null;
  };
}

export interface IService {
  _id: string;
  name: string;
  category: string;
  subcategory?: string;
  price?: number | null;
  basePrice?: number | null;
  duration?: number;
  variants?: IServiceVariant[];
  extras?: IServiceExtra[];
  services?: IServiceGroupItem[];
  type: "single" | "group" | "variant";
  description: string;
  items: string[];
  featured?: HomePagePosition;
  subscription: ISubscription;
  createdAt: string;
  updatedAt: string;
}

export interface IServiceVariant {
  name: string;
  price: number;
  duration: number;
  perItem: boolean;
}

export interface IServiceExtra {
  name: string;
  price: number;
  duration: number;
  perItem: boolean;
}

export interface IServiceGroupItem {
  name: string;
  price: number;
  duration: number;
  description: string;
}

export type HomePagePosition = "main" | "second" | "third" | "none";

export interface ISubscription {
  enabled: boolean;
  priceMonthly: number | null;
  startDate: string | null;
  endDate: string | null;
}

export interface FlatSlot {
  salonId: string;
  salonName: string;
  serviceId: string | null;
  serviceName: string;
  category: string;
  startTime: string; // ISO
  city: string;
  distanceKm?: number;
  price?: number;
}

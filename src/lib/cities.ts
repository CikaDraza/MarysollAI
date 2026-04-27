export interface SerbianCity {
  name: string;
  lat: number;
  lng: number;
}

export const SERBIAN_CITIES: SerbianCity[] = [
  { name: "Novi Sad",           lat: 45.2671, lng: 19.8335 },
  { name: "Beograd",            lat: 44.8176, lng: 20.4569 },
  { name: "Sremska Mitrovica",  lat: 44.9744, lng: 19.6122 },
  { name: "Subotica",           lat: 46.1003, lng: 19.6658 },
  { name: "Zrenjanin",          lat: 45.3817, lng: 20.3839 },
  { name: "Loznica",            lat: 44.5333, lng: 19.2167 },
  { name: "Bor",                lat: 44.0869, lng: 22.0986 },
  { name: "Niš",                lat: 43.3209, lng: 21.8954 },
  { name: "Kraljevo",           lat: 43.7234, lng: 20.6892 },
];

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearestCity(lat: number, lng: number): SerbianCity {
  return SERBIAN_CITIES.reduce((best, c) => {
    return haversineKm(lat, lng, c.lat, c.lng) < haversineKm(lat, lng, best.lat, best.lng)
      ? c
      : best;
  });
}

export function findCity(name: string): SerbianCity | undefined {
  const lower = name.toLowerCase().trim();
  return SERBIAN_CITIES.find((c) => c.name.toLowerCase() === lower);
}

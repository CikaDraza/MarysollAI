// Social-proof stats for a salon. The COUNTS come from the platform (source of
// truth) via /marketplace/salon-stats — the booking app never recomputes them.
// `formatStatValue` is a pure presentation helper copied from the platform
// (rounds down so counts read as social proof: 124 → "120+").

export interface SalonStats {
  clientCount: number;
  appointmentCount: number;
  completedAppointmentCount: number;
  /** null when there are no approved reviews. */
  averageRating: number | null;
  reviewCount: number;
}

function roundDown(n: number): number {
  if (n < 10) return n;
  if (n < 100) return Math.floor(n / 10) * 10;
  return Math.floor(n / 100) * 100;
}

export function formatStatValue(n: number): string {
  const rounded = roundDown(n);
  if (rounded >= 1000) {
    const thousands = Math.floor(rounded / 1000);
    const remainder = rounded % 1000;
    const remainderStr =
      remainder > 0 ? ` ${String(remainder).padStart(3, "0")}` : " 000";
    return `${thousands}${remainderStr}+`;
  }
  return `${rounded}+`;
}

// src/helpers/price.ts

/**
 * Format number to "1.234,56" (thousand separator '.' and decimal ',' with two decimals)
 * Assumes input is integer or number (RSD without decimals usually), returns string with 2 decimals.
 */
export function formatPriceToString(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "";
  const n = Number(value);
  // ensure two decimals
  const parts = n.toFixed(2).split(".");
  const intPart = parts[0];
  const decPart = parts[1];
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + decPart;
}

/**
 * Parse input like "5.000,00" or "5000" or "5,000.00" to number
 */
export function parsePriceInputToNumber(str: string): number {
  if (!str) return 0;
  // remove spaces
  let s = String(str).trim();
  // if user used comma as decimal: "5.000,50"
  // We want to remove dots (thousand separator) and convert comma to dot for parseFloat
  s = s.replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) {
    // assume "." are thousands and "," decimal -> remove dots, replace comma with dot
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    // if only comma present -> treat as decimal separator
    s = s.replace(",", ".");
  } else {
    // no comma, may have dots as thousands -> remove them
    s = s.replace(/\./g, "");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

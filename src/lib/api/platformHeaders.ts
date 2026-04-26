// src/lib/api/platformHeaders.ts
export function platformHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": process.env.MARYSOLL_API_KEY ?? "",
    ...extra,
  };
}

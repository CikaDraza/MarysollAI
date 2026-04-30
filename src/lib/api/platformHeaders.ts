// src/lib/api/platformHeaders.ts
export function platformHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": process.env.PLATFORM_API_KEY ?? "",
    ...extra,
  };
}

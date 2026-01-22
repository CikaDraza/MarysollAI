import { headers } from "next/headers";

export async function getRequestIP() {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown"
  );
}

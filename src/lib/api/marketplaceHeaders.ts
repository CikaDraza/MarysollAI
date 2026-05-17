// Builds HMAC-signed headers for server-to-server calls to the platform's
// marketplace endpoints. Used by proxy routes that need to bypass tenant-scoped
// JWT auth (e.g. cross-tenant appointments).
import crypto from "crypto";

const API_KEY = process.env.PLATFORM_API_KEY ?? "";
const API_SECRET = process.env.PLATFORM_API_SECRET ?? "";

export function marketplaceHeaders(bodyString = ""): Record<string, string> {
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac("sha256", API_SECRET)
    .update(bodyString + timestamp)
    .digest("hex");

  return {
    "Content-Type": "application/json",
    "x-api-key": API_KEY,
    "x-timestamp": timestamp,
    "x-signature": signature,
  };
}

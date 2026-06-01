import crypto from "crypto";

// Serbian diacritic map (covers all common Latin-Extended Serbian chars).
const DIACRITIC_MAP: Record<string, string> = {
  č: "c", Č: "c", ć: "c", Ć: "c",
  š: "s", Š: "s", ž: "z", Ž: "z",
  đ: "d", Đ: "d", dž: "dz", Dž: "dz",
};

export function normalizeWatchText(value: string | null | undefined): string {
  if (!value) return "";
  let s = value.toLowerCase().trim();
  // Replace multi-char diacritics first.
  s = s.replace(/dž/gi, "dz");
  // Single-char diacritics.
  s = s.replace(/[čćšžđČĆŠŽĐ]/g, (ch) => DIACRITIC_MAP[ch] ?? ch);
  // Collapse whitespace.
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export function normalizeWatchPhone(value: string | null | undefined): string {
  if (!value) return "";
  // Keep only digits and leading '+'.
  return value.replace(/[^\d+]/g, "").toLowerCase();
}

export interface WatchContactInput {
  clientId?: string | null;
  email?: string | null;
  phone?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
}

/** Returns the single best identity token for this watch request. */
export function normalizeWatchContact(input: WatchContactInput): string {
  if (input.clientId?.trim()) return `uid:${input.clientId.trim()}`;
  if (input.email?.trim()) return `email:${input.email.trim().toLowerCase()}`;
  const phone = normalizeWatchPhone(input.phone);
  if (phone) return `phone:${phone}`;
  if (input.instagram?.trim())
    return `ig:${input.instagram.trim().replace(/^@/, "").toLowerCase()}`;
  if (input.tiktok?.trim())
    return `tt:${input.tiktok.trim().replace(/^@/, "").toLowerCase()}`;
  return "anon";
}

export interface WatchDedupeInput {
  clientId?: string | null;
  email?: string | null;
  phone?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  serviceName: string;
  city: string;
  salonId?: string | null;
  preferredTimeMode?: string | null;
  preferredDate?: string | null;
  timeWindowStart?: number | null;
  timeWindowEnd?: number | null;
}

/**
 * Builds a deterministic SHA-256 hex key for deduplicating watch requests.
 * The final hash does not expose raw PII — only a stable canonical form is
 * included in the plaintext before hashing.
 */
export function buildAvailabilityWatchDedupeKey(
  input: WatchDedupeInput,
): string {
  const contact = normalizeWatchContact(input);
  const service = normalizeWatchText(input.serviceName);
  const city = normalizeWatchText(input.city);
  const salonPart = input.salonId ? `salon:${input.salonId.trim()}` : "";
  const timeMode = input.preferredTimeMode ?? "anytime";
  const datePart = input.preferredDate ? `date:${input.preferredDate}` : "";
  const windowPart = [
    input.timeWindowStart != null ? `ws:${input.timeWindowStart}` : "",
    input.timeWindowEnd != null ? `we:${input.timeWindowEnd}` : "",
  ]
    .filter(Boolean)
    .join("|");

  const raw = [contact, service, city, salonPart, timeMode, datePart, windowPart]
    .filter(Boolean)
    .join("|");

  return crypto.createHash("sha256").update(raw).digest("hex");
}

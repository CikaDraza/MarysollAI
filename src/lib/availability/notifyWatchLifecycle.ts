import {
  normalizeBookingPayload,
  validateBookingPayload,
  type BookingModalSlot,
} from "@/lib/booking/bookingPayload";

/**
 * Storage key for the active NotifyMe watch id. We persist ONLY the watch id
 * (an opaque ObjectId), never any contact/personal data.
 */
export const NOTIFY_WATCH_STORAGE_KEY = "marysoll_notify_watch_id";

/** Status values the GET /api/waitlist endpoint can report for a watch. */
export type WatchApiStatus =
  | "active"
  | "matched"
  | "notified"
  | "booked"
  | "expired"
  | "cancelled"
  | "failed";

/**
 * Collapsed UI states the widget renders. Several API statuses map to a single
 * visual state (e.g. matched/notified/booked all mean "we found a slot").
 */
export type WatchViewState =
  | "idle"
  | "active"
  | "matched"
  | "expired"
  | "cancelled"
  | "failed";

/** Minimal storage surface so the helpers stay testable without a DOM. */
export interface WatchStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function deriveWatchViewState(
  status: string | null | undefined,
): WatchViewState {
  switch (status) {
    case "active":
      return "active";
    case "matched":
    case "notified":
    case "booked":
      return "matched";
    case "expired":
      return "expired";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
    default:
      return "idle";
  }
}

/** Only an active watch should keep polling; every other state is terminal. */
export function shouldPollWatch(status: string | null | undefined): boolean {
  return deriveWatchViewState(status) === "active";
}

export function isTerminalWatchStatus(
  status: string | null | undefined,
): boolean {
  return deriveWatchViewState(status) !== "active";
}

/** Expired / cancelled / not-found watches are dead — drop the stored id. */
export function shouldClearStorage(view: WatchViewState): boolean {
  return view === "idle" || view === "expired" || view === "cancelled";
}

export function readStoredWatchId(
  storage: WatchStorageLike | null | undefined,
): string | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(NOTIFY_WATCH_STORAGE_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function storeWatchId(
  storage: WatchStorageLike | null | undefined,
  id: string,
): void {
  if (!storage || !id) return;
  try {
    storage.setItem(NOTIFY_WATCH_STORAGE_KEY, id);
  } catch {
    /* storage may be unavailable (private mode, quota) — non-fatal */
  }
}

export function clearStoredWatchId(
  storage: WatchStorageLike | null | undefined,
): void {
  if (!storage) return;
  try {
    storage.removeItem(NOTIFY_WATCH_STORAGE_KEY);
  } catch {
    /* non-fatal */
  }
}

/**
 * A matched slot is "complete" when it has enough fields to open BookingModal
 * directly. If incomplete we need a re-verification step before booking.
 */
export function isMatchedSlotComplete(
  slot: BookingModalSlot | null | undefined,
): boolean {
  if (!slot) return false;
  return validateBookingPayload(normalizeBookingPayload(slot)).ok;
}

/**
 * Returns the canonical URL for cancelling a watch via DELETE.
 * Used by email templates and the widget cancel flow.
 */
export function buildWatchCancelUrl(
  watchId: string,
  baseUrl = "",
): string {
  const path = `/api/waitlist?id=${encodeURIComponent(watchId)}`;
  return baseUrl ? `${baseUrl.replace(/\/$/, "")}${path}` : path;
}

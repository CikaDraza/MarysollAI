import type { SearchResult } from "@/types/slots";
import type { AuthUser } from "@/types/auth-types";

export type BookingModalSlot = Partial<SearchResult> & {
  date?: string;
  time?: string;
  duration?: number;
};

export interface NormalizedBookingPayload {
  salonId: string;
  salonName: string;
  salonAddress?: string;
  salonLat?: number;
  salonLng?: number;
  mapsLink?: string;
  distanceKm?: number;
  travelMinutesEstimate?: number;
  serviceId: string;
  serviceName: string;
  city: string;
  date: string;
  time: string;
  startTime: string;
  duration: number;
  price: number;
  originalSlot: BookingModalSlot;
}

export interface BookingPayloadValidation {
  ok: boolean;
  missingFields: string[];
  recoverable: boolean;
}

export type PreferredContact = "phone" | "instagram" | "email" | "platform";

export interface BookingContactForm {
  name: string;
  phone?: string;
  email?: string;
  instagram?: string;
}

export interface BookingContactPayload {
  clientId?: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  clientInstagram?: string;
  preferredContact: PreferredContact;
  contactNote?: string;
  user: {
    name: string;
    phone?: string;
    email?: string;
    instagram?: string;
  };
}

type SlotLike = BookingModalSlot;

const REQUIRED_FIELDS: Array<keyof NormalizedBookingPayload> = [
  "salonId",
  "salonName",
  "serviceId",
  "serviceName",
  "city",
  "date",
  "time",
  "startTime",
  "duration",
  "price",
];

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function dateInBelgrade(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Belgrade",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function timeInBelgrade(iso: string): string {
  return new Intl.DateTimeFormat("sr-Latn", {
    timeZone: "Europe/Belgrade",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

function offsetMinutesForBelgrade(utcDate: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Belgrade",
    timeZoneName: "shortOffset",
  }).formatToParts(utcDate);
  const offset = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+1";
  const match = offset.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return 60;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");
  return sign * (hours * 60 + minutes);
}

export function buildBelgradeStartTime(date: string, time: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const approximateUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = offsetMinutesForBelgrade(approximateUtc);
  return new Date(approximateUtc.getTime() - offset * 60_000).toISOString();
}

export function normalizeBookingPayload(
  selectedSlot: SlotLike | null | undefined,
): NormalizedBookingPayload | null {
  if (!selectedSlot) return null;

  const startTime = isNonEmpty(selectedSlot.startTime)
    ? selectedSlot.startTime
    : isNonEmpty(selectedSlot.date) && isNonEmpty(selectedSlot.time ?? selectedSlot.timeLabel)
      ? buildBelgradeStartTime(selectedSlot.date, selectedSlot.time ?? selectedSlot.timeLabel!)
      : "";

  const date = isNonEmpty(selectedSlot.date)
    ? selectedSlot.date
    : startTime
      ? dateInBelgrade(startTime)
      : "";
  const time = isNonEmpty(selectedSlot.time)
    ? selectedSlot.time
    : isNonEmpty(selectedSlot.timeLabel)
      ? selectedSlot.timeLabel
      : startTime
        ? timeInBelgrade(startTime)
        : "";

  const duration =
    typeof selectedSlot.duration === "number"
      ? selectedSlot.duration
      : typeof selectedSlot.serviceDuration === "number"
        ? selectedSlot.serviceDuration
        : 0;
  const price = typeof selectedSlot.price === "number" ? selectedSlot.price : Number.NaN;

  return {
    salonId: selectedSlot.salonId ?? "",
    salonName: selectedSlot.salonName ?? "",
    salonAddress: selectedSlot.salonAddress,
    salonLat: selectedSlot.salonLat,
    salonLng: selectedSlot.salonLng,
    mapsLink: selectedSlot.mapsLink,
    distanceKm: selectedSlot.distanceKm,
    travelMinutesEstimate: selectedSlot.travelMinutesEstimate,
    serviceId: selectedSlot.serviceId ?? "",
    serviceName: selectedSlot.serviceName ?? "",
    city: selectedSlot.city ?? "",
    date,
    time,
    startTime,
    duration,
    price,
    originalSlot: {
      ...selectedSlot,
      startTime,
      dateLabel: selectedSlot.dateLabel ?? date,
      timeLabel: selectedSlot.timeLabel ?? time,
    } as BookingModalSlot,
  };
}

export function validateBookingPayload(
  payload: NormalizedBookingPayload | null,
): BookingPayloadValidation {
  if (!payload) {
    return { ok: false, missingFields: [...REQUIRED_FIELDS], recoverable: true };
  }

  const missingFields = REQUIRED_FIELDS.filter((field) => {
    const value = payload[field];
    if (typeof value === "number") return !Number.isFinite(value) || value <= 0;
    return !isNonEmpty(value);
  });

  return {
    ok: missingFields.length === 0,
    missingFields,
    recoverable: missingFields.some((field) =>
      ["salonId", "salonName", "serviceId", "startTime", "date", "time", "duration", "price"].includes(
        field,
      ),
    ),
  };
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim();
}

export function getUserPhone(user?: AuthUser | null): string {
  return firstNonEmpty(user?.phone, user?.phoneNumber, user?.mobile, user?.mobilePhone) ?? "";
}

export function getUserInstagram(user?: AuthUser | null): string {
  return firstNonEmpty(user?.instagram, user?.instagramUsername) ?? "";
}

export function validateContactForm(input: {
  isAuthenticated: boolean;
  form: BookingContactForm;
}): { ok: boolean; message?: string } {
  const name = input.form.name.trim();
  const phone = input.form.phone?.trim() ?? "";
  const email = input.form.email?.trim() ?? "";
  const instagram = input.form.instagram?.trim() ?? "";

  if (!name) {
    return { ok: false, message: "Unesite ime i prezime." };
  }

  if (!input.isAuthenticated && !phone && !email && !instagram) {
    return {
      ok: false,
      message: "Unesite telefon, email ili Instagram da salon može da potvrdi termin.",
    };
  }

  return { ok: true };
}

export function buildBookingContactPayload(input: {
  user?: AuthUser | null;
  form: BookingContactForm;
}): BookingContactPayload {
  const user = input.user;
  const isAuthenticated = Boolean(user);
  const formName = input.form.name.trim();
  const formPhone = input.form.phone?.trim() ?? "";
  const formEmail = input.form.email?.trim() ?? "";
  const formInstagram = input.form.instagram?.trim() ?? "";
  const profilePhone = getUserPhone(user);
  const profileInstagram = getUserInstagram(user);

  if (isAuthenticated && user) {
    const preferredContact: PreferredContact = formPhone
      ? "phone"
      : formInstagram
        ? "instagram"
        : "platform";
    const contactNote =
      preferredContact === "phone"
        ? "Klijent želi kontakt za ovaj termin preko unetog telefona."
        : preferredContact === "instagram"
          ? "Klijent želi kontakt za ovaj termin preko Instagrama."
          : undefined;

    return {
      clientId: user.id,
      clientName: formName || user.name,
      clientEmail: formEmail || user.email,
      clientPhone: formPhone || profilePhone || undefined,
      clientInstagram: formInstagram || profileInstagram || undefined,
      preferredContact,
      contactNote,
      user: {
        name: formName || user.name,
        phone: formPhone || profilePhone || undefined,
        email: formEmail || user.email,
        instagram: formInstagram || profileInstagram || undefined,
      },
    };
  }

  const preferredContact: PreferredContact = formPhone
    ? "phone"
    : formInstagram
      ? "instagram"
      : "email";

  return {
    clientName: formName,
    clientEmail: formEmail || undefined,
    clientPhone: formPhone || undefined,
    clientInstagram: formInstagram || undefined,
    preferredContact,
    user: {
      name: formName,
      phone: formPhone || undefined,
      email: formEmail || undefined,
      instagram: formInstagram || undefined,
    },
  };
}

export const BOOKING_CONFLICT_MESSAGE =
  "Taj termin je u međuvremenu zauzet. Proveravam najbliži slobodan termin.";

/**
 * Returns true when the API response indicates the slot was already taken by
 * another user. Checks HTTP status 409 and known error code/message patterns.
 */
export function isBookingConflict(status: number, error?: string): boolean {
  if (status === 409) return true;
  if (!error) return false;
  return /SLOT_TAKEN|appointment.?conflict|termin.?je.?zauzet/i.test(error);
}

export function mapBookingErrorMessage(error?: string): string {
  if (!error) return "Greška pri zakazivanju. Pokušajte ponovo.";
  const embeddedJson = error.match(/\{.*\}/)?.[0];
  if (embeddedJson) {
    try {
      const parsed = JSON.parse(embeddedJson) as { error?: unknown; message?: unknown };
      const nested =
        typeof parsed.error === "string"
          ? parsed.error
          : typeof parsed.message === "string"
            ? parsed.message
            : undefined;
      if (nested) return mapBookingErrorMessage(nested);
    } catch {
      // Fall through to pattern matching below.
    }
  }
  if (/SLOT_TAKEN|appointment.?conflict|termin.?je.?zauzet/i.test(error)) {
    return BOOKING_CONFLICT_MESSAGE;
  }
  if (/ime i telefon su obavezni/i.test(error)) {
    return "Unesite telefon, email ili Instagram da salon može da potvrdi termin.";
  }
  if (/salonId and startTime are required/i.test(error)) {
    return "Nedostaje salon ili termin. Pokušavam da pronađem odgovarajući salon.";
  }
  if (/Booking failed|Platform API \d+/i.test(error)) {
    return "Zakazivanje trenutno nije uspelo. Pokušajte ponovo za trenutak.";
  }
  return error;
}

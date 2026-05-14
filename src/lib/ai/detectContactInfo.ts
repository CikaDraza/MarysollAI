import { stripDiacritics } from "@/lib/intent/parseIntent";
import type { AiBookingContact } from "@/types/aiBooking";

export interface ContactInfoResult extends AiBookingContact {
  hasContactInfo: boolean;
}

function cleanName(value: string): string | undefined {
  const trimmed = value
    .replace(/[+]?381\s*\d+|0\s*6\d[\d\s/-]+/gi, "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
    .replace(/[,:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!trimmed) return undefined;
  const normalized = stripDiacritics(trimmed).toLowerCase();
  if (
    /\b(da|moze|može|potvrdjujem|potvrdujem|potvrđujem|telefon|email|mejl|kontakt)\b/.test(
      normalized,
    )
  ) {
    return undefined;
  }

  const words = trimmed.split(" ").filter(Boolean);
  if (words.length === 0 || words.length > 4) return undefined;
  if (words.some((word) => !/^[\p{L}.'-]{2,}$/u.test(word))) return undefined;
  return words.join(" ");
}

export function detectContactInfo(input: {
  userMessage: string;
}): ContactInfoResult {
  const text = input.userMessage.trim();
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const phoneRaw = text.match(/(?:\+381|00381|0)\s*6\d(?:[\s/-]?\d){6,8}/)?.[0];
  const phone = phoneRaw?.replace(/[\s/-]/g, "").replace(/^00381/, "+381");

  let name: string | undefined;
  const commaPrefix = text.split(/[,\n;]/)[0];
  if (commaPrefix && commaPrefix !== text) {
    name = cleanName(commaPrefix);
  }
  name ??= cleanName(text);

  return {
    hasContactInfo: Boolean(phone || email),
    name,
    phone,
    email,
  };
}

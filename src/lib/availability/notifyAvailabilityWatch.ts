import { InAppNotification } from "@/lib/models/InAppNotification";
import type { IAvailabilityWatchDoc } from "@/lib/models/AvailabilityWatch";
import type { SearchResult } from "@/types/slots";
import crypto from "crypto";

function buildResumeHref(watchId: string, slot: SearchResult): string {
  const params = new URLSearchParams({
    resumeWatch: watchId,
    slotId: [
      slot.salonId,
      slot.serviceId ?? "",
      slot.startTime,
    ].join(":"),
  });
  return `/?${params.toString()}`;
}

function formatSlotDateTime(slot: SearchResult): string {
  return `${slot.dateLabel} u ${slot.timeLabel}`;
}

async function sendResendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AVAILABILITY_WATCH_EMAIL_FROM ?? process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { skipped: "missing_resend_env" };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend email failed: ${res.status} ${detail}`);
  }

  return { sent: true };
}

function base64UrlToBuffer(value: string): Buffer {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function vapidJwt(audience: string): string {
  const subject = process.env.VAPID_SUBJECT ?? "mailto:hello@marysoll.com";
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("Missing VAPID keys for browser push");
  }

  const header = base64Url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = base64Url(
    JSON.stringify({
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
      sub: subject,
    }),
  );
  const signer = crypto.createSign("SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  const key = crypto.createPrivateKey({
    key: base64UrlToBuffer(privateKey),
    format: "der",
    type: "pkcs8",
  });
  const signature = signer.sign({ key, dsaEncoding: "ieee-p1363" });
  return `${header}.${payload}.${base64Url(signature)}`;
}

async function sendBrowserPush(
  subscription: NonNullable<IAvailabilityWatchDoc["pushSubscription"]>,
) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return { skipped: "missing_vapid_public_key" };

  const endpoint = new URL(subscription.endpoint);
  const audience = `${endpoint.protocol}//${endpoint.host}`;
  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      TTL: "900",
      Authorization: `vapid t=${vapidJwt(audience)}, k=${publicKey}`,
      "Content-Length": "0",
    },
  });

  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Browser push failed: ${res.status} ${detail}`);
  }

  return { sent: res.ok };
}

export async function notifyAvailabilityWatch(
  watch: IAvailabilityWatchDoc,
  slot: SearchResult,
) {
  const watchId = String(watch._id);
  const href = buildResumeHref(watchId, slot);
  const publicBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const bookingUrl = publicBaseUrl ? new URL(href, publicBaseUrl).toString() : href;
  const slotLabel = formatSlotDateTime(slot);
  const salonLabel = [slot.salonName, slot.city].filter(Boolean).join(", ");
  const subject = `Pojavio se slobodan termin za ${watch.serviceName}`;
  const text = [
    subject,
    "",
    slotLabel,
    salonLabel,
    "",
    `Rezerviši termin: ${bookingUrl}`,
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h2 style="margin: 0 0 12px;">${subject}</h2>
      <p style="margin: 0 0 8px;"><strong>${slotLabel}</strong></p>
      <p style="margin: 0 0 18px;">${salonLabel}</p>
      <a href="${bookingUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">Rezerviši termin</a>
    </div>
  `;

  if (watch.email && watch.notificationChannels.includes("email")) {
    await sendResendEmail({ to: watch.email, subject, html, text });
  }

  if (watch.pushSubscription && watch.notificationChannels.includes("push")) {
    await sendBrowserPush(watch.pushSubscription);
  }

  if (watch.clientId && watch.notificationChannels.includes("in_app")) {
    await InAppNotification.create({
      clientId: watch.clientId,
      type: "availability_watch_matched",
      title: subject,
      message: `${slotLabel} · ${salonLabel}`,
      href,
    });
  }

  return { href, bookingUrl };
}

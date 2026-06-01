import webpush from "web-push";
import { InAppNotification } from "@/lib/models/InAppNotification";
import type { IAvailabilityWatchDoc } from "@/lib/models/AvailabilityWatch";
import type { SearchResult } from "@/types/slots";

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

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  watchId: string;
}

export function buildPushPayload(
  watch: Pick<IAvailabilityWatchDoc, "serviceName" | "city">,
  watchId: string,
  bookingUrl: string,
): PushPayload {
  return {
    title: "Marysoll",
    body: `Pronašli smo termin za ${watch.serviceName} u ${watch.city}.`,
    url: bookingUrl,
    watchId,
  };
}

async function sendBrowserPush(
  subscription: NonNullable<IAvailabilityWatchDoc["pushSubscription"]>,
  payload: PushPayload,
) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:hello@marysoll.com";

  if (!publicKey || !privateKey) return { skipped: "missing_vapid_keys" };

  const p256dh = subscription.keys?.p256dh;
  const auth = subscription.keys?.auth;
  if (!p256dh || !auth) return { skipped: "missing_subscription_keys" };

  webpush.setVapidDetails(subject, publicKey, privateKey);

  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh, auth } },
      JSON.stringify(payload),
      { TTL: 900 },
    );
    return { sent: true };
  } catch (err: unknown) {
    // 404/410 = subscription expired/invalid — treat as non-fatal.
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return { sent: false, expired: true };
    throw err;
  }
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
  const addressLabel = [slot.salonAddress, slot.city].filter(Boolean).join(", ");
  const subject = `Pojavio se slobodan termin za ${watch.serviceName}`;
  const text = [
    subject,
    "",
    slotLabel,
    salonLabel,
    addressLabel ? `Adresa: ${addressLabel}` : undefined,
    slot.mapsLink ? `Mapa: ${slot.mapsLink}` : undefined,
    "",
    `Rezerviši termin: ${bookingUrl}`,
  ].filter((line): line is string => line != null).join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h2 style="margin: 0 0 12px;">${subject}</h2>
      <p style="margin: 0 0 8px;"><strong>${slotLabel}</strong></p>
      <p style="margin: 0 0 18px;">${salonLabel}</p>
      ${addressLabel ? `<p style="margin: 0 0 12px;"><strong>Adresa:</strong> ${addressLabel}</p>` : ""}
      ${slot.mapsLink ? `<p style="margin: 0 0 18px;"><a href="${slot.mapsLink}" style="color:#111827;font-weight:700;">Prikaži lokaciju</a></p>` : ""}
      <a href="${bookingUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">Rezerviši termin</a>
    </div>
  `;

  if (watch.email && watch.notificationChannels.includes("email")) {
    await sendResendEmail({ to: watch.email, subject, html, text });
  }

  if (watch.pushSubscription && watch.notificationChannels.includes("push")) {
    const pushPayload = buildPushPayload(watch, watchId, bookingUrl);
    await sendBrowserPush(watch.pushSubscription, pushPayload);
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

import { registerMarysollServiceWorker } from "./registerServiceWorker";

export function isBrowserPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64String}${"=".repeat((4 - (base64String.length % 4)) % 4)}`;
  const raw = window.atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

/** Requests Notification permission. Returns `"granted"` | `"denied"` | `"default"`. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isBrowserPushSupported()) return "denied";
  return Notification.requestPermission();
}

export type BrowserPushSubscriptionData = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

/**
 * Registers the SW, requests permission, and creates or reuses a push
 * subscription. Returns null if push is unsupported, permission is denied,
 * or any step fails — never throws to the caller.
 */
export async function subscribeToBrowserPush(
  vapidPublicKey: string,
): Promise<BrowserPushSubscriptionData | null> {
  if (!isBrowserPushSupported()) return null;
  if (!vapidPublicKey) return null;

  try {
    const permission = await requestNotificationPermission();
    if (permission !== "granted") return null;

    const registration = await registerMarysollServiceWorker();
    if (!registration) return null;

    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      }));

    const json = subscription.toJSON();
    const p256dh = json.keys?.p256dh ?? "";
    const auth = json.keys?.auth ?? "";
    if (!p256dh || !auth) return null;

    return { endpoint: subscription.endpoint, keys: { p256dh, auth } };
  } catch {
    return null;
  }
}

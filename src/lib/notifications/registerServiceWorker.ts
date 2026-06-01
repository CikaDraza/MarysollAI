/**
 * Registers the Marysoll service worker. Safe to call in any environment;
 * returns null when SW is unavailable or registration fails.
 */
export async function registerMarysollServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (
    typeof window === "undefined" ||
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator)
  ) {
    return null;
  }

  try {
    return await navigator.serviceWorker.register("/marysoll-sw.js");
  } catch {
    return null;
  }
}

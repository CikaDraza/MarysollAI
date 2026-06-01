import fs from "fs";
import path from "path";
import { isBrowserPushSupported } from "@/lib/notifications/browserPush";
import {
  buildPushPayload,
  type PushPayload,
} from "@/lib/availability/notifyAvailabilityWatch";

// ---------------------------------------------------------------------------
// isBrowserPushSupported
// ---------------------------------------------------------------------------

describe("isBrowserPushSupported", () => {
  it("returns false in Node (no window/navigator/PushManager)", () => {
    // Running in jest/node — none of the browser globals exist.
    expect(isBrowserPushSupported()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// registerServiceWorker — returns null when serviceWorker unsupported
// ---------------------------------------------------------------------------

describe("registerMarysollServiceWorker", () => {
  it("returns null when serviceWorker is unsupported (node env)", async () => {
    const { registerMarysollServiceWorker } = await import(
      "@/lib/notifications/registerServiceWorker"
    );
    const result = await registerMarysollServiceWorker();
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// urlBase64ToUint8Array
// ---------------------------------------------------------------------------

describe("urlBase64ToUint8Array", () => {
  it("is exported from browserPush", () => {
    // In node env window.atob isn't available — just verify the export exists.
    const mod = require("@/lib/notifications/browserPush");
    expect(typeof mod.urlBase64ToUint8Array).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// buildPushPayload — server-side payload builder
// ---------------------------------------------------------------------------

describe("buildPushPayload", () => {
  const watch = { serviceName: "Šminkanje", city: "Beograd" };
  const watchId = "watch-123";
  const bookingUrl = "https://app.marysoll.com/?resumeWatch=watch-123";

  let payload: PushPayload;
  beforeAll(() => {
    payload = buildPushPayload(watch, watchId, bookingUrl);
  });

  it("sets title to Marysoll", () => {
    expect(payload.title).toBe("Marysoll");
  });

  it("includes service and city in body", () => {
    expect(payload.body).toContain("Šminkanje");
    expect(payload.body).toContain("Beograd");
  });

  it("sets url to the booking URL (contains resumeWatch)", () => {
    expect(payload.url).toBe(bookingUrl);
    expect(payload.url).toContain("resumeWatch=watch-123");
  });

  it("includes watchId", () => {
    expect(payload.watchId).toBe(watchId);
  });

  it("does not include phone, email, or instagram", () => {
    const json = JSON.stringify(payload);
    expect(json).not.toContain("phone");
    expect(json).not.toContain("email");
    expect(json).not.toContain("instagram");
  });
});

// ---------------------------------------------------------------------------
// Source-level: NotifyMeWidget must not call new Notification() directly
// ---------------------------------------------------------------------------

describe("NotifyMeWidget source integrity", () => {
  it("does not contain direct new Notification() calls", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/components/landing/NotifyMeWidget.tsx"),
      "utf8",
    );
    // Allow the string inside a comment (e.g. '// No direct Notification()'),
    // but reject actual constructor calls.
    const directNewNotification = /new\s+Notification\s*\(/.test(src);
    expect(directNewNotification).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Service Worker source integrity
// ---------------------------------------------------------------------------

describe("marysoll-sw.js service worker", () => {
  let swSrc: string;
  beforeAll(() => {
    swSrc = fs.readFileSync(
      path.join(process.cwd(), "public/marysoll-sw.js"),
      "utf8",
    );
  });

  it("contains a push event listener", () => {
    expect(swSrc).toContain(`addEventListener("push"`);
  });

  it("contains a notificationclick event listener", () => {
    expect(swSrc).toContain(`addEventListener("notificationclick"`);
  });

  it("shows a notification via self.registration.showNotification", () => {
    expect(swSrc).toContain("showNotification");
  });

  it("parses event.data.json() for the push payload", () => {
    expect(swSrc).toContain("event.data.json()");
  });

  it("tries to focus an existing window before opening a new one", () => {
    expect(swSrc).toContain("matchAll");
    expect(swSrc).toContain("focus");
  });
});

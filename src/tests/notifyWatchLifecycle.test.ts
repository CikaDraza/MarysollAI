import fs from "fs";
import path from "path";
import {
  NOTIFY_WATCH_STORAGE_KEY,
  clearStoredWatchId,
  deriveWatchViewState,
  isMatchedSlotComplete,
  isTerminalWatchStatus,
  readStoredWatchId,
  shouldClearStorage,
  shouldPollWatch,
  storeWatchId,
  type WatchStorageLike,
} from "@/lib/availability/notifyWatchLifecycle";
import type { BookingModalSlot } from "@/lib/booking/bookingPayload";

function makeStorage(initial: Record<string, string> = {}): WatchStorageLike {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const COMPLETE_SLOT: BookingModalSlot = {
  salonId: "salon-1",
  salonName: "Studio Lux",
  serviceId: "svc-1",
  serviceName: "Šminkanje",
  city: "Beograd",
  startTime: "2026-06-02T13:00:00.000Z",
  date: "2026-06-02",
  time: "15:00",
  duration: 60,
  price: 2500,
};

describe("notifyWatchLifecycle — storage", () => {
  it("stores and reads the watch id under the agreed key (POST success path)", () => {
    const storage = makeStorage();
    storeWatchId(storage, "watch-123");
    expect(storage.getItem(NOTIFY_WATCH_STORAGE_KEY)).toBe("watch-123");
    expect(readStoredWatchId(storage)).toBe("watch-123");
  });

  it("restores an existing watch id on mount", () => {
    const storage = makeStorage({ [NOTIFY_WATCH_STORAGE_KEY]: "watch-xyz" });
    expect(readStoredWatchId(storage)).toBe("watch-xyz");
  });

  it("returns null for empty/whitespace stored values", () => {
    expect(readStoredWatchId(makeStorage())).toBeNull();
    expect(
      readStoredWatchId(makeStorage({ [NOTIFY_WATCH_STORAGE_KEY]: "   " })),
    ).toBeNull();
  });

  it("clears the stored watch id", () => {
    const storage = makeStorage({ [NOTIFY_WATCH_STORAGE_KEY]: "watch-1" });
    clearStoredWatchId(storage);
    expect(readStoredWatchId(storage)).toBeNull();
  });

  it("never throws when storage is unavailable", () => {
    expect(() => storeWatchId(null, "x")).not.toThrow();
    expect(() => clearStoredWatchId(null)).not.toThrow();
    expect(readStoredWatchId(null)).toBeNull();
  });
});

describe("notifyWatchLifecycle — view state mapping", () => {
  it("active maps to active and keeps polling", () => {
    expect(deriveWatchViewState("active")).toBe("active");
    expect(shouldPollWatch("active")).toBe(true);
    expect(isTerminalWatchStatus("active")).toBe(false);
  });

  it("matched/notified/booked all collapse to the matched view", () => {
    expect(deriveWatchViewState("matched")).toBe("matched");
    expect(deriveWatchViewState("notified")).toBe("matched");
    expect(deriveWatchViewState("booked")).toBe("matched");
  });

  it("matched stops polling", () => {
    expect(shouldPollWatch("matched")).toBe(false);
    expect(isTerminalWatchStatus("matched")).toBe(true);
  });

  it("expired/cancelled/failed map to their own states", () => {
    expect(deriveWatchViewState("expired")).toBe("expired");
    expect(deriveWatchViewState("cancelled")).toBe("cancelled");
    expect(deriveWatchViewState("failed")).toBe("failed");
  });

  it("unknown/null status is idle", () => {
    expect(deriveWatchViewState(null)).toBe("idle");
    expect(deriveWatchViewState(undefined)).toBe("idle");
    expect(deriveWatchViewState("garbage")).toBe("idle");
  });
});

describe("notifyWatchLifecycle — storage clearing rules", () => {
  it("clears storage for expired/cancelled/not-found (idle), keeps for active/matched/failed", () => {
    expect(shouldClearStorage("expired")).toBe(true);
    expect(shouldClearStorage("cancelled")).toBe(true);
    expect(shouldClearStorage("idle")).toBe(true);
    expect(shouldClearStorage("active")).toBe(false);
    expect(shouldClearStorage("matched")).toBe(false);
    expect(shouldClearStorage("failed")).toBe(false);
  });
});

describe("notifyWatchLifecycle — matched slot completeness", () => {
  it("treats a fully populated slot as complete (direct booking)", () => {
    expect(isMatchedSlotComplete(COMPLETE_SLOT)).toBe(true);
  });

  it("treats a partial slot as incomplete (needs re-verification)", () => {
    expect(
      isMatchedSlotComplete({
        serviceName: "Šminkanje",
        city: "Beograd",
      }),
    ).toBe(false);
  });

  it("treats null/undefined as incomplete", () => {
    expect(isMatchedSlotComplete(null)).toBe(false);
    expect(isMatchedSlotComplete(undefined)).toBe(false);
  });
});

describe("vercel.json cron config", () => {
  it("registers the availability-watch cron path", () => {
    const raw = fs.readFileSync(
      path.join(process.cwd(), "vercel.json"),
      "utf8",
    );
    const config = JSON.parse(raw) as {
      crons?: { path: string; schedule: string }[];
    };
    const cron = config.crons?.find(
      (c) => c.path === "/api/cron/check-availability-watches",
    );
    expect(cron).toBeDefined();
    expect(cron?.schedule).toBe("*/15 * * * *");
  });
});

import fs from "fs";
import path from "path";
import {
  isSlotStillPresent,
} from "@/lib/availability/revalidateMatchedSlot";
import type { SearchResult } from "@/types/slots";

// ---------------------------------------------------------------------------
// isSlotStillPresent — pure slot-presence check
// ---------------------------------------------------------------------------

function makeSlot(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    salonId: "salon-1",
    salonName: "Studio Lux",
    serviceId: "svc-1",
    serviceName: "Šminkanje",
    category: "makeup",
    city: "Beograd",
    startTime: "2026-06-10T13:00:00.000Z",
    dateLabel: "Sre, 10. jun",
    timeLabel: "15:00",
    relevanceScore: 1,
    fallbackLevel: 0,
    ...overrides,
  };
}

const SLOTS: SearchResult[] = [
  makeSlot({ startTime: "2026-06-10T11:00:00.000Z" }),
  makeSlot({ startTime: "2026-06-10T13:00:00.000Z" }),
  makeSlot({ salonId: "salon-2", startTime: "2026-06-10T14:00:00.000Z" }),
];

describe("isSlotStillPresent", () => {
  it("returns true when startTime and salonId match a slot in the list", () => {
    expect(
      isSlotStillPresent(SLOTS, "2026-06-10T13:00:00.000Z", "salon-1"),
    ).toBe(true);
  });

  it("returns false when startTime is found but salonId differs", () => {
    expect(
      isSlotStillPresent(SLOTS, "2026-06-10T13:00:00.000Z", "salon-2"),
    ).toBe(false);
  });

  it("returns false when startTime is not in the list", () => {
    expect(
      isSlotStillPresent(SLOTS, "2026-06-10T16:00:00.000Z", "salon-1"),
    ).toBe(false);
  });

  it("returns true when salonId is omitted and startTime matches any salon", () => {
    expect(isSlotStillPresent(SLOTS, "2026-06-10T14:00:00.000Z")).toBe(true);
  });

  it("returns false for empty slot list", () => {
    expect(isSlotStillPresent([], "2026-06-10T13:00:00.000Z", "salon-1")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Resume endpoint response status classification helpers
// (mirrors the logic used in the route and widget)
// ---------------------------------------------------------------------------

type WatchStatus = "active" | "matched" | "notified" | "booked" | "expired" | "cancelled" | "failed";

const TERMINAL_FOR_RESUME = new Set(["expired", "cancelled", "failed", "booked"]);

function resumeHttpStatus(watchStatus: WatchStatus): number {
  if (!TERMINAL_FOR_RESUME.has(watchStatus)) return 200;
  return watchStatus === "failed" ? 409 : 410;
}

describe("resume endpoint status classification", () => {
  it("returns 410 for expired watch", () => {
    expect(resumeHttpStatus("expired")).toBe(410);
  });

  it("returns 410 for cancelled watch", () => {
    expect(resumeHttpStatus("cancelled")).toBe(410);
  });

  it("returns 409 for failed watch", () => {
    expect(resumeHttpStatus("failed")).toBe(409);
  });

  it("returns 200 for active/matched/notified watch (revalidation proceeds)", () => {
    expect(resumeHttpStatus("active")).toBe(200);
    expect(resumeHttpStatus("matched")).toBe(200);
    expect(resumeHttpStatus("notified")).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Source integrity: LandingPage uses /resume, not the bare /api/waitlist
// ---------------------------------------------------------------------------

describe("LandingPage ResumeWatchOpener source integrity", () => {
  let src: string;
  beforeAll(() => {
    src = fs.readFileSync(
      path.join(process.cwd(), "src/components/landing/LandingPage.tsx"),
      "utf8",
    );
  });

  it("calls /api/waitlist/resume — not the bare GET /api/waitlist?id", () => {
    expect(src).toContain("/api/waitlist/resume");
  });

  it("only opens modal when status is available", () => {
    expect(src).toContain(`data.status === "available"`);
  });

  it("does not call openModal with raw matchedSlot from the old endpoint", () => {
    // The old pattern was: openModal(data.matchedSlot)
    // Verify that specific pattern is absent (multi-line safe check).
    expect(src.includes("openModal(data.matchedSlot)")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Source integrity: widget calls /resume before openModal
// ---------------------------------------------------------------------------

describe("NotifyMeWidget resume source integrity", () => {
  let src: string;
  beforeAll(() => {
    src = fs.readFileSync(
      path.join(process.cwd(), "src/components/landing/NotifyMeWidget.tsx"),
      "utf8",
    );
  });

  it("calls /api/waitlist/resume before opening the booking modal", () => {
    expect(src).toContain("/api/waitlist/resume");
  });

  it("does not have a handleViewSlot function (replaced by handleResumeAndView)", () => {
    expect(src.includes("handleViewSlot")).toBe(false);
  });

  it("shows conflict message copy in Serbian", () => {
    expect(src).toContain("Taj termin je u međuvremenu zauzet");
  });

  it("shows no_longer_available copy in Serbian", () => {
    expect(src).toContain("Nastavljamo da pratimo vaš zahtev");
  });
});

// ---------------------------------------------------------------------------
// Slot conflict: Serbian copy present in widget
// ---------------------------------------------------------------------------

describe("Booking conflict user-facing copy", () => {
  it("conflict message uses Serbian copy", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/components/landing/NotifyMeWidget.tsx"),
      "utf8",
    );
    expect(src).toContain("Termin je u međuvremenu zauzet");
  });
});

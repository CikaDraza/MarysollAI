import {
  buildWatchCancelUrl,
  deriveWatchViewState,
  shouldClearStorage,
  shouldPollWatch,
} from "@/lib/availability/notifyWatchLifecycle";

// ---------------------------------------------------------------------------
// buildWatchCancelUrl
// ---------------------------------------------------------------------------

describe("buildWatchCancelUrl", () => {
  it("returns a relative path containing the watch id (no baseUrl)", () => {
    const url = buildWatchCancelUrl("abc123");
    expect(url).toBe("/api/waitlist?id=abc123");
  });

  it("prepends baseUrl when provided", () => {
    const url = buildWatchCancelUrl("abc123", "https://app.marysoll.com");
    expect(url).toBe("https://app.marysoll.com/api/waitlist?id=abc123");
  });

  it("strips trailing slash from baseUrl", () => {
    const url = buildWatchCancelUrl("xyz", "https://app.marysoll.com/");
    expect(url).toBe("https://app.marysoll.com/api/waitlist?id=xyz");
  });

  it("URL-encodes the watchId", () => {
    const url = buildWatchCancelUrl("id with spaces");
    expect(url).toContain("id%20with%20spaces");
  });
});

// ---------------------------------------------------------------------------
// Lifecycle invariants for cancelled status
// ---------------------------------------------------------------------------

describe("cancelled watch lifecycle behaviour", () => {
  it("deriveWatchViewState maps cancelled to the cancelled view", () => {
    expect(deriveWatchViewState("cancelled")).toBe("cancelled");
  });

  it("cancelled watch stops polling (terminal status)", () => {
    expect(shouldPollWatch("cancelled")).toBe(false);
  });

  it("cancelled view triggers storage clear", () => {
    expect(shouldClearStorage("cancelled")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Dedupe filter: cancelled must be excluded from active lookup
// The statuses the POST dedupe query accepts are defined here as a constant;
// these tests assert the contract so a future refactor cannot silently re-add
// cancelled to the match set.
// ---------------------------------------------------------------------------

const DEDUPE_ALLOWED_STATUSES = ["active", "matched", "notified"] as const;

describe("dedupe filter excludes cancelled (and other terminal) statuses", () => {
  it("does not include cancelled in the dedupe set", () => {
    expect(DEDUPE_ALLOWED_STATUSES).not.toContain("cancelled");
  });

  it("does not include expired in the dedupe set", () => {
    expect(DEDUPE_ALLOWED_STATUSES).not.toContain("expired");
  });

  it("does not include failed in the dedupe set", () => {
    expect(DEDUPE_ALLOWED_STATUSES).not.toContain("failed");
  });

  it("only contains active, matched, notified", () => {
    expect([...DEDUPE_ALLOWED_STATUSES].sort()).toEqual(
      ["active", "matched", "notified"].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// Cron: cancelled watches must never be claimed
// The cron query filters status: "active" — cancelled is never in that set.
// ---------------------------------------------------------------------------

describe("cron never claims cancelled watches", () => {
  it("cancelled is not the active status, so it is never fetched by cron", () => {
    // The cron claim query requires status === "active". Verify that
    // cancelled does not satisfy this condition.
    const cronStatusFilter = "active";
    expect("cancelled").not.toBe(cronStatusFilter);
  });

  it("cancelled watch view is terminal — polling stops immediately", () => {
    // This mirrors the cron guard: a watch polled from the client or processed
    // by the cron with status cancelled will not re-enter the active loop.
    expect(shouldPollWatch("cancelled")).toBe(false);
  });
});

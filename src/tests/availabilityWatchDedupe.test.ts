import {
  buildAvailabilityWatchDedupeKey,
  normalizeWatchContact,
  normalizeWatchText,
  normalizeWatchPhone,
} from "@/lib/availability/availabilityWatchDedupe";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function base(overrides: Partial<Parameters<typeof buildAvailabilityWatchDedupeKey>[0]> = {}) {
  return buildAvailabilityWatchDedupeKey({
    email: "ana@example.com",
    serviceName: "Šminkanje",
    city: "Beograd",
    preferredTimeMode: "anytime",
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// normalizeWatchText
// ---------------------------------------------------------------------------

describe("normalizeWatchText", () => {
  it("lowercases and trims", () => {
    expect(normalizeWatchText("  Beograd  ")).toBe("beograd");
  });

  it("strips Serbian diacritics from service name", () => {
    expect(normalizeWatchText("Šminkanje")).toBe("sminkanje");
    expect(normalizeWatchText("Češljanje")).toBe("cesljanje");
    expect(normalizeWatchText("Ženska frizura")).toBe("zenska frizura");
    expect(normalizeWatchText("Đakuzi masaža")).toBe("dakuzi masaza");
  });

  it("handles null/undefined gracefully", () => {
    expect(normalizeWatchText(null)).toBe("");
    expect(normalizeWatchText(undefined)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// normalizeWatchPhone
// ---------------------------------------------------------------------------

describe("normalizeWatchPhone", () => {
  it("removes spaces, dashes, and parentheses", () => {
    expect(normalizeWatchPhone("+381 60 123-456 7")).toBe("+38160123456​7".replace(/​/, ""));
    expect(normalizeWatchPhone("+381 60 123-4567")).toBe("+381601234567");
    expect(normalizeWatchPhone("(060) 123-4567")).toBe("0601234567");
  });

  it("handles null/undefined gracefully", () => {
    expect(normalizeWatchPhone(null)).toBe("");
    expect(normalizeWatchPhone(undefined)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// normalizeWatchContact — identity priority
// ---------------------------------------------------------------------------

describe("normalizeWatchContact", () => {
  it("prefers clientId over all", () => {
    const r = normalizeWatchContact({
      clientId: "user-1",
      email: "a@b.com",
      phone: "+381601234",
    });
    expect(r).toBe("uid:user-1");
  });

  it("falls back to lowercased email", () => {
    expect(normalizeWatchContact({ email: "ANA@Example.COM" })).toBe(
      "email:ana@example.com",
    );
  });

  it("falls back to normalized phone", () => {
    expect(normalizeWatchContact({ phone: "+381 60 123-4567" })).toBe(
      "phone:+381601234567",
    );
  });

  it("falls back to instagram (strips @)", () => {
    expect(normalizeWatchContact({ instagram: "@Ana.Styling" })).toBe(
      "ig:ana.styling",
    );
  });

  it("falls back to tiktok (strips @)", () => {
    expect(normalizeWatchContact({ tiktok: "@ana_tiktok" })).toBe(
      "tt:ana_tiktok",
    );
  });

  it("returns anon if no identity", () => {
    expect(normalizeWatchContact({})).toBe("anon");
  });
});

// ---------------------------------------------------------------------------
// buildAvailabilityWatchDedupeKey — determinism
// ---------------------------------------------------------------------------

describe("buildAvailabilityWatchDedupeKey", () => {
  it("same input produces same key", () => {
    expect(base()).toBe(base());
  });

  it("email case and surrounding spaces do not affect key", () => {
    expect(base({ email: "ANA@EXAMPLE.COM" })).toBe(base({ email: "ana@example.com" }));
    expect(base({ email: "  ana@example.com  " })).toBe(base({ email: "ana@example.com" }));
  });

  it("Serbian diacritics do not affect service or city key", () => {
    expect(base({ serviceName: "Sminkanje", city: "Beograd" })).toBe(
      base({ serviceName: "Šminkanje", city: "Beograd" }),
    );
  });

  it("different service produces different key", () => {
    expect(base({ serviceName: "Masaža" })).not.toBe(base({ serviceName: "Manikir" }));
  });

  it("different city produces different key", () => {
    expect(base({ city: "Beograd" })).not.toBe(base({ city: "Novi Sad" }));
  });

  it("salonId changes the key when present", () => {
    expect(base({ salonId: "salon-1" })).not.toBe(base({ salonId: undefined }));
    expect(base({ salonId: "salon-1" })).not.toBe(base({ salonId: "salon-2" }));
  });

  it("returned key is a 64-char hex string (SHA-256)", () => {
    const key = base();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("dedupeKey does not contain raw email or phone", () => {
    const key = buildAvailabilityWatchDedupeKey({
      email: "ana@example.com",
      phone: "+381601234567",
      serviceName: "Manikir",
      city: "Beograd",
    });
    expect(key).not.toContain("ana@example.com");
    expect(key).not.toContain("+381601234567");
  });

  it("timeWindowStart/End changes the key", () => {
    expect(base({ timeWindowStart: 10, timeWindowEnd: 14 })).not.toBe(base());
  });

  it("preferredDate changes the key", () => {
    expect(base({ preferredDate: "2026-06-02" })).not.toBe(base());
  });
});

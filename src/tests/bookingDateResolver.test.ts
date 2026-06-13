// P0 #1 — canonical booking-date resolver. Deterministic via injected `now`.
import { resolveBookingDate } from "@/lib/date/bookingDateResolver";

describe("resolveBookingDate (canonical, shared with search)", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it("danas → today + today's date", () => {
    expect(resolveBookingDate("danas", now)).toMatchObject({
      dateMode: "today",
      date: "2026-06-15",
    });
  });

  it("sutra → tomorrow", () => {
    expect(resolveBookingDate("može sutra u 10", now)).toMatchObject({
      dateMode: "tomorrow",
      date: "2026-06-16",
    });
  });

  it("prekosutra → day after tomorrow", () => {
    expect(resolveBookingDate("prekosutra posle 15", now)).toMatchObject({
      dateMode: "day_after_tomorrow",
      date: "2026-06-17",
    });
  });

  it("utorak → weekday with a concrete future date (NOT tomorrow)", () => {
    const r = resolveBookingDate("hoću u utorak", now);
    expect(r.dateMode).toBe("weekday");
    expect(r.weekday).toBe("utorak");
    expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.date! > "2026-06-15").toBe(true); // strictly in the future
  });

  it("u nedelju → Sunday weekday, NOT generic weekend", () => {
    const r = resolveBookingDate("u nedelju", now);
    expect(r.dateMode).toBe("weekday");
    expect(r.weekday).toBe("nedelja");
    expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("za vikend → weekend mode, no single date", () => {
    const r = resolveBookingDate("za vikend", now);
    expect(r.dateMode).toBe("weekend");
    expect(r.date).toBeUndefined();
  });

  it("explicit dd.mm → explicit date", () => {
    expect(resolveBookingDate("15.07", now)).toMatchObject({
      dateMode: "explicit",
      date: "2026-07-15",
    });
  });

  it("no date phrase → confidence 0", () => {
    expect(resolveBookingDate("šminkanje u Beogradu", now).confidence).toBe(0);
  });
});

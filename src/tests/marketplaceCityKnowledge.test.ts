import { cityLocative } from "@/lib/geo/cityLocative";
import { bookingWidgetRecoveryCopy } from "@/lib/search/bookingWidgetRecoveryCopy";
import { stripDiacritics } from "@/lib/intent/parseIntent";

// ---------------------------------------------------------------------------
// City normalization — Kruševac / Krusevac
// ---------------------------------------------------------------------------

describe("city normalization (stripDiacritics)", () => {
  it("treats Kruševac and Krusevac as equal", () => {
    expect(stripDiacritics("Kruševac")).toBe(stripDiacritics("Krusevac"));
  });

  it("normalizes Čačak / Cacak and Niš / Nis", () => {
    expect(stripDiacritics("Čačak")).toBe(stripDiacritics("Cacak"));
    expect(stripDiacritics("Niš")).toBe(stripDiacritics("Nis"));
  });
});

// ---------------------------------------------------------------------------
// cityLocative
// ---------------------------------------------------------------------------

describe("cityLocative", () => {
  it("returns Kruševcu for Kruševac", () => {
    expect(cityLocative("Kruševac")).toBe("Kruševcu");
  });

  it("covers other cities", () => {
    expect(cityLocative("Niš")).toBe("Nišu");
    expect(cityLocative("Novi Sad")).toBe("Novom Sadu");
  });

  it("falls back to nominative for unknown city", () => {
    expect(cityLocative("Foobargrad")).toBe("Foobargrad");
  });

  it("returns a placeholder for empty input", () => {
    expect(cityLocative(undefined)).toBe("izabranom gradu");
  });
});

// ---------------------------------------------------------------------------
// bookingWidgetRecoveryCopy — false "no salon" fix (TASK 5)
// ---------------------------------------------------------------------------

describe("bookingWidgetRecoveryCopy", () => {
  it("no_city_salons → says there is no salon", () => {
    const copy = bookingWidgetRecoveryCopy({
      city: "Kruševac",
      recoveryState: { reason: "no_city_salons", requestedCity: "Kruševac" },
    });
    expect(copy?.title).toContain("Nema salona");
    expect(copy?.title).toContain("Kruševcu");
  });

  it("no_city_slots → does NOT say no salon, says no free terms", () => {
    const copy = bookingWidgetRecoveryCopy({
      city: "Kruševac",
      recoveryState: { reason: "no_city_slots", requestedCity: "Kruševac" },
    });
    expect(copy?.title).not.toContain("Nema salona");
    expect(copy?.title).toContain("nema slobodnih termina");
    expect(copy?.title).toContain("imamo salon");
  });

  it("no_city_slots with service → mentions the service, not 'no salon'", () => {
    const copy = bookingWidgetRecoveryCopy({
      city: "Kruševac",
      serviceLabel: "Šminkanje",
      recoveryState: { reason: "no_city_slots", requestedCity: "Kruševac" },
    });
    expect(copy?.title).not.toContain("Nema salona");
    expect(copy?.title).toContain("Šminkanje");
    expect(copy?.title).toContain("Kruševcu");
  });
});

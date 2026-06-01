import {
  filterSalonsForAutocomplete,
  normalizeSalonSearch,
  type SalonOption,
} from "@/lib/availability/salonAutocomplete";

const SALONS: SalonOption[] = [
  {
    id: "s1",
    name: "Studio Lux",
    city: "Beograd",
    services: [
      { name: "Šminkanje", category: "makeup" },
      { name: "Češljanje", category: "hair" },
    ],
  },
  {
    id: "s2",
    name: "Beauty Glow",
    city: "Beograd",
    services: [{ name: "Manikir", category: "nails" }],
  },
  {
    id: "s3",
    name: "Studio Bliss",
    city: "Novi Sad",
    services: [{ name: "Masaža", category: "massage" }],
  },
  {
    id: "s4",
    name: "Salon Žarko",
    city: "Bor",
    services: [{ name: "Šišanje", category: "hair" }],
  },
  {
    id: "s5",
    name: "Art Nails",
    city: "Beograd",
    services: [{ name: "Gel Manikir", category: "nails" }],
  },
  {
    id: "s6",
    name: "Lux Beauty",
    city: "Novi Sad",
  },
  {
    id: "s7",
    name: "Studio Zen",
    city: "Beograd",
    services: [{ name: "Masaža", category: "massage" }],
  },
  {
    id: "s8",
    name: "Tijana Beauty",
    city: "Beograd",
  },
  {
    id: "s9",
    name: "Extra Studio",
    city: "Niš",
  },
];

// ---------------------------------------------------------------------------
// normalizeSalonSearch
// ---------------------------------------------------------------------------

describe("normalizeSalonSearch", () => {
  it("lowercases and trims", () => {
    expect(normalizeSalonSearch("  STUDIO  ")).toBe("studio");
  });

  it("strips Serbian diacritics", () => {
    expect(normalizeSalonSearch("Žarko")).toBe("zarko");
    expect(normalizeSalonSearch("Šminkanje")).toBe("sminkanje");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeSalonSearch("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// filterSalonsForAutocomplete
// ---------------------------------------------------------------------------

describe("filterSalonsForAutocomplete", () => {
  it("matches salon by name case-insensitively", () => {
    const results = filterSalonsForAutocomplete(SALONS, "studio");
    const ids = results.map((r) => r.id);
    expect(ids).toContain("s1"); // Studio Lux
    expect(ids).toContain("s3"); // Studio Bliss
    expect(ids).toContain("s7"); // Studio Zen
    expect(ids).toContain("s9"); // Extra Studio
  });

  it("matches with Serbian diacritics stripped (Žarko → zarko)", () => {
    const results = filterSalonsForAutocomplete(SALONS, "Žarko");
    expect(results.map((r) => r.id)).toContain("s4");
  });

  it("matches salon by city name", () => {
    const results = filterSalonsForAutocomplete(SALONS, "novi sad");
    expect(results.map((r) => r.id)).toContain("s3");
    expect(results.map((r) => r.id)).toContain("s6");
  });

  it("returns empty array for unknown query", () => {
    const results = filterSalonsForAutocomplete(SALONS, "xyznonexistent");
    expect(results).toHaveLength(0);
  });

  it("returns empty array for empty query", () => {
    expect(filterSalonsForAutocomplete(SALONS, "")).toHaveLength(0);
  });

  it("limits results to 8 by default", () => {
    // "studio" or "beauty" hits many salons — ensure cap is respected.
    const bigList: SalonOption[] = Array.from({ length: 20 }, (_, i) => ({
      id: `x${i}`,
      name: `Studio ${i}`,
      city: "Beograd",
    }));
    const results = filterSalonsForAutocomplete(bigList, "studio");
    expect(results.length).toBeLessThanOrEqual(8);
  });

  it("respects custom limit", () => {
    const results = filterSalonsForAutocomplete(SALONS, "studio", {
      limit: 2,
    });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("city option ranks matching-city salons first", () => {
    const results = filterSalonsForAutocomplete(SALONS, "studio", {
      city: "Beograd",
    });
    // Beograd studios should appear before Novi Sad / Niš studios.
    const beogradIds = new Set(["s1", "s7"]);
    const firstTwo = results.slice(0, 2).map((r) => r.id);
    expect(firstTwo.every((id) => beogradIds.has(id))).toBe(true);
  });

  it("service option ranks service-matching salons first within same city", () => {
    // Among Beograd salons matching "lux", prefer the one offering makeup.
    const results = filterSalonsForAutocomplete(SALONS, "studio", {
      city: "Beograd",
      service: "masaža",
    });
    // Studio Zen offers masaža in Beograd → should rank first among city matches.
    expect(results[0].id).toBe("s7");
  });
});

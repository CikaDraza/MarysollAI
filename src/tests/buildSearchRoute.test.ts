import { buildSearchRoute } from "@/lib/search/buildSearchRoute";

describe("buildSearchRoute — intent → canonical route", () => {
  const cases: [string, string | null][] = [
    ["Saloni u Boru", "/bor"],
    ["Salon Bor", "/bor"],
    ["Beauty saloni u Boru", "/bor"],
    ["Šminkanje u Boru", "/bor/sminkanje"],
    ["Salon u Boru šminkanje", "/bor/sminkanje"],
    ["Šminkanje u Boru posle 14", "/bor/sminkanje?after=14"],
    ["Šminkanje u Boru sutra posle 14", "/bor/sminkanje?date=tomorrow&after=14"],
    // Declined (locative) city forms must resolve, not just nominative.
    ["Šminkanje u Kruševcu", "/krusevac/sminkanje"],
    ["Frizura u Novom Sadu", "/novi-sad/frizura"],
    ["Saloni u Kruševcu", "/krusevac"],
  ];

  it.each(cases)("%s → %s", (query, expected) => {
    expect(buildSearchRoute(query)?.path ?? null).toBe(expected);
  });

  it("returns null when no city is present (in-place search)", () => {
    expect(buildSearchRoute("šminkanje")).toBeNull();
  });

  it("uses an explicit context city when the query omits one", () => {
    expect(buildSearchRoute("šminkanje posle 14", "Bor")?.path).toBe(
      "/bor/sminkanje?after=14",
    );
  });

  it("treats neutral words as discovery, not a category", () => {
    // "salon" must not become a category → city-only route
    expect(buildSearchRoute("salon u Nišu")?.path).toBe("/nis");
  });

  it("query city overrides the context city (no drift bug)", () => {
    // On /bor/sminkanje, searching another city must route there, not stay.
    expect(buildSearchRoute("Šminkanje u Kruševcu", "Bor")?.path).toBe(
      "/krusevac/sminkanje",
    );
  });
});

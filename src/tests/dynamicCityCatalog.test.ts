import {
  SERBIAN_CITIES,
  CITY_POPULARITY,
  STATIC_SERBIAN_CITIES,
  setCityCatalog,
  findCity,
  nearestCity,
  type DynamicCity,
} from "@/lib/cities";

// Reset to static catalog after each test so order-independence holds.
function resetCatalog() {
  setCityCatalog(
    STATIC_SERBIAN_CITIES.map((c) => ({
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      popularityScore: 0,
    })),
  );
}

describe("setCityCatalog — dynamic city hydration", () => {
  afterEach(resetCatalog);

  it("adds a brand-new city not present in the static list", () => {
    const cities: DynamicCity[] = [
      { name: "Vranje", lat: 42.5514, lng: 21.9, popularityScore: 5 },
    ];
    setCityCatalog(cities);
    expect(findCity("Vranje")).toEqual({ name: "Vranje", lat: 42.5514, lng: 21.9 });
    expect(CITY_POPULARITY["Vranje"]).toBe(5);
  });

  it("backfills coordinates from static list when platform omits them", () => {
    setCityCatalog([{ name: "Beograd", lat: null, lng: null, popularityScore: 9 }]);
    const bg = findCity("Beograd");
    expect(bg?.lat).toBeCloseTo(44.8176, 3);
    expect(bg?.lng).toBeCloseTo(20.4569, 3);
  });

  it("drops a city with no coords and no static fallback from the geo catalog", () => {
    setCityCatalog([
      { name: "NepoznatGrad", lat: null, lng: null, popularityScore: 3 },
    ]);
    expect(findCity("NepoznatGrad")).toBeUndefined();
    // but popularity is still recorded
    expect(CITY_POPULARITY["NepoznatGrad"]).toBe(3);
  });

  it("replaces the live SERBIAN_CITIES binding (read-only consumers see it)", () => {
    setCityCatalog([
      { name: "Bor", lat: 44.0869, lng: 22.0986, popularityScore: 8 },
    ]);
    expect(SERBIAN_CITIES.map((c) => c.name)).toEqual(["Bor"]);
  });

  it("ignores an empty catalog (keeps previous list)", () => {
    setCityCatalog([{ name: "Niš", lat: 43.32, lng: 21.89, popularityScore: 1 }]);
    setCityCatalog([]);
    expect(findCity("Niš")).toBeDefined();
  });

  it("nearestCity uses the dynamic catalog", () => {
    setCityCatalog([
      { name: "Vranje", lat: 42.5514, lng: 21.9, popularityScore: 5 },
      { name: "Beograd", lat: 44.8176, lng: 20.4569, popularityScore: 9 },
    ]);
    // A point near Vranje should snap to Vranje, which only exists dynamically.
    expect(nearestCity(42.6, 21.9).name).toBe("Vranje");
  });
});

describe("static fallback integrity", () => {
  afterEach(resetCatalog);

  it("STATIC_SERBIAN_CITIES still has the 9 seed cities", () => {
    expect(STATIC_SERBIAN_CITIES).toHaveLength(9);
    expect(STATIC_SERBIAN_CITIES.map((c) => c.name)).toContain("Beograd");
  });
});

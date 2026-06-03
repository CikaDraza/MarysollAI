// Verifies platform-knowledge derives citiesText from the authoritative
// /marketplace/cities endpoint (not from the availability-limited salon list).

// Pass-through unstable_cache so the inner fetcher runs directly in tests.
jest.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

const getMarketplaceCities = jest.fn();
const getSalonProfiles = jest.fn();
const getCategories = jest.fn();
const getSalonServices = jest.fn();

jest.mock("@/lib/api/platformClient", () => ({
  platformClient: {
    getMarketplaceCities: (...a: unknown[]) => getMarketplaceCities(...a),
    getSalonProfiles: (...a: unknown[]) => getSalonProfiles(...a),
    getCategories: (...a: unknown[]) => getCategories(...a),
    getSalonServices: (...a: unknown[]) => getSalonServices(...a),
  },
}));

import { fetchPlatformKnowledge } from "@/lib/ai/platform-knowledge";

beforeEach(() => {
  jest.clearAllMocks();
  // Only 1 salon is returned (e.g. availability-limited), but cities endpoint
  // knows about more — citiesText must follow the cities endpoint.
  getSalonProfiles.mockResolvedValue([
    { _id: "bg-1", name: "Studio BG", city: "Beograd" },
  ]);
  getCategories.mockResolvedValue([]);
  getSalonServices.mockResolvedValue([]);
});

describe("fetchPlatformKnowledge citiesText", () => {
  it("uses /marketplace/cities, not deriveCities(salons)", async () => {
    getMarketplaceCities.mockResolvedValue([
      { name: "Beograd", lat: 44.8, lng: 20.4, popularityScore: 9 },
      { name: "Kruševac", lat: 43.58, lng: 21.33, popularityScore: 3 },
      { name: "Novi Sad", lat: 45.26, lng: 19.83, popularityScore: 8 },
    ]);

    const knowledge = await fetchPlatformKnowledge();

    expect(getMarketplaceCities).toHaveBeenCalled();
    expect(knowledge.citiesText).toContain("Kruševac");
    expect(knowledge.citiesText).toContain("Beograd");
    expect(knowledge.citiesText).toContain("Novi Sad");
  });

  it("requests salons with a high limit (sees every city)", async () => {
    getMarketplaceCities.mockResolvedValue([
      { name: "Beograd", lat: 44.8, lng: 20.4, popularityScore: 9 },
    ]);

    await fetchPlatformKnowledge();

    expect(getSalonProfiles).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 }),
    );
  });

  it("falls back to deriveCities when cities endpoint is empty", async () => {
    getMarketplaceCities.mockResolvedValue([]);
    getSalonProfiles.mockResolvedValue([
      { _id: "ns-1", name: "Studio NS", city: "Novi Sad" },
    ]);

    const knowledge = await fetchPlatformKnowledge();
    expect(knowledge.citiesText).toContain("Novi Sad");
  });
});

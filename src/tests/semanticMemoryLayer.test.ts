import type {
  PlatformSalon,
  PlatformService,
} from "@/lib/api/platformClient";
import type { PlatformCategory } from "@/types/category-types";
import { buildSemanticMemory } from "@/lib/ai/memory/buildSemanticMemory";
import { resolveSemanticQuery } from "@/lib/ai/memory/semanticLookup";
import { buildAgentMemoryContext } from "@/lib/ai/memory/buildAgentMemoryContext";
import { formatAgentMemoryForPrompt } from "@/lib/ai/memory/formatAgentMemoryForPrompt";
import { buildMariaSystemPrompt } from "@/app/api/ai/deepseek-conversation/route";
import { buildClaudiaSystemPrompt } from "@/services/askAgent";

const categories: PlatformCategory[] = [
  {
    key: "massage",
    label: "Masaža",
    synonyms: ["masaža", "masaza", "massage", "maderoterapija"],
    subcategories: [
      {
        key: "maderotherapy",
        label: "Maderoterapija",
        synonyms: ["maderoterapija", "madero"],
      },
    ],
  },
  {
    key: "hair",
    label: "Kosa",
    synonyms: ["kosa", "hair", "haircut", "blowout", "feniranje", "šišanje"],
    subcategories: [
      {
        key: "haircut",
        label: "Šišanje",
        synonyms: ["sisanje", "šišanje", "haircut"],
      },
      {
        key: "blowout",
        label: "Feniranje",
        synonyms: ["feniranje", "blowout"],
      },
    ],
  },
  {
    key: "makeup",
    label: "Šminka",
    synonyms: ["šminka", "sminka", "makeup", "make-up", "šminkanje"],
    subcategories: [],
  },
  {
    key: "nails",
    label: "Nokti",
    synonyms: ["nokti", "nails"],
    subcategories: [],
  },
];

const salons: PlatformSalon[] = [
  { _id: "bor-1", name: "Beauty M Glow", city: "Bor" },
  { _id: "ns-1", name: "Shi Sham", city: "Novi Sad" },
  { _id: "bg-1", name: "Belisimo Makeup", city: "Beograd" },
];

const services: PlatformService[] = [
  {
    _id: "svc-madero",
    name: "Maderoterapija",
    category: "massage",
    salonId: "bor-1",
    salonName: "Beauty M Glow",
    city: "Bor",
    description: "x".repeat(5000),
  },
  {
    _id: "svc-haircut",
    name: "Šišanje",
    category: "hair",
    salonId: "ns-1",
    salonName: "Shi Sham",
    city: "Novi Sad",
    description: "large haircut description",
  },
  {
    _id: "svc-blowout",
    name: "Feniranje",
    category: "hair",
    salonId: "ns-1",
    salonName: "Shi Sham",
    city: "Novi Sad",
  },
  {
    _id: "svc-makeup",
    name: "Šminkanje",
    category: "makeup",
    salonId: "bg-1",
    salonName: "Belisimo Makeup",
    city: "Beograd",
  },
];

function semanticMemory() {
  return buildSemanticMemory({ salons, services, categories });
}

describe("semantic memory layer", () => {
  it("buildSemanticMemory maps maderoterapija to Masaža and Bor", () => {
    const memory = semanticMemory();
    const item = memory.services.find((service) => service.label === "Maderoterapija");

    expect(item).toMatchObject({
      categoryLabel: "Masaža",
      cities: ["Bor"],
      salonNames: ["Beauty M Glow"],
    });
  });

  it("buildSemanticMemory maps feniranje to Kosa and Novi Sad", () => {
    const memory = semanticMemory();
    const item = memory.services.find((service) => service.label === "Feniranje");

    expect(item).toMatchObject({
      categoryLabel: "Kosa",
      cities: ["Novi Sad"],
    });
  });

  it("resolveSemanticQuery for maderoterapija returns category Masaža", () => {
    const result = resolveSemanticQuery("maderoterapija", semanticMemory());

    expect(result).toMatchObject({
      matched: true,
      canonicalCategory: "Masaža",
      categoryKey: "massage",
    });
  });

  it("resolveSemanticQuery for makeup returns Šminka", () => {
    const result = resolveSemanticQuery("makeup", semanticMemory());

    expect(result).toMatchObject({
      matched: true,
      canonicalCategory: "Šminka",
      categoryKey: "makeup",
    });
  });

  it("resolveSemanticQuery for haircut returns Kosa and šišanje", () => {
    const result = resolveSemanticQuery("haircut", semanticMemory());

    expect(result.matched).toBe(true);
    expect(result.canonicalCategory).toBe("Kosa");
    expect(result.canonicalService).toBe("Šišanje");
  });

  it("cityServiceMap includes Bor -> maderoterapija", () => {
    const memory = semanticMemory();

    expect(memory.cityServiceMap.Bor).toContain("Maderoterapija");
  });

  it("serviceCityMap includes feniranje -> Novi Sad", () => {
    const memory = semanticMemory();

    expect(memory.serviceCityMap.Feniranje).toContain("Novi Sad");
  });

  it("Semantic memory does not include huge service descriptions", () => {
    const serialized = JSON.stringify(semanticMemory());

    expect(serialized).not.toContain("x".repeat(100));
    expect(serialized.length).toBeLessThan(8000);
  });

  it("Unknown service returns matched=false and low confidence", () => {
    const result = resolveSemanticQuery("astro spa quantum", semanticMemory());

    expect(result.matched).toBe(false);
    expect(result.confidence).toBeLessThan(0.3);
  });
});

import type {
  PlatformSalon,
  PlatformService,
} from "@/lib/api/platformClient";
import type { PlatformCategory } from "@/types/category-types";
import type {
  SemanticCategoryMemoryItem,
  SemanticMemory,
  SemanticServiceMemoryItem,
} from "./agent-memory-types";

const MAX_CATEGORIES = 40;
const MAX_SERVICES = 120;
const MAX_SYNONYMS = 12;
const MAX_CITIES_PER_SERVICE = 12;
const MAX_SALONS_PER_SERVICE = 12;
const COMMON_SERVICE_SYNONYMS: Record<string, string[]> = {
  masaza: ["massage", "maderoterapija", "relax masaza", "limfna drenaza"],
  masaža: ["massage", "maderoterapija", "relax masaža", "limfna drenaža"],
  kosa: ["hair", "haircut", "sisanje", "šišanje", "feniranje", "blowout"],
  sminka: ["makeup", "make-up", "sminka", "šminka", "sminkanje", "šminkanje"],
  šminka: ["makeup", "make-up", "sminka", "šminka", "sminkanje", "šminkanje"],
  nokti: ["nails", "manikir", "pedikir", "gel lak"],
  trepavice: ["lashes", "lash", "ekstenzije trepavica"],
};

type ServiceWithSalon = PlatformService & {
  salonId?: string;
  salonName?: string;
  city?: string;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/š/g, "s")
    .replace(/đ/g, "dj")
    .replace(/ž/g, "z")
    .replace(/č/g, "c")
    .replace(/ć/g, "c")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function keyFromLabel(value: string): string {
  return normalize(value).replace(/\s+/g, "-");
}

function dedupe(values: Array<string | undefined>, limit = MAX_SYNONYMS): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const clean = value.trim();
    if (!clean) continue;
    const key = normalize(clean);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= limit) break;
  }
  return result;
}

function findCategory(
  rawCategory: string | undefined,
  categories: PlatformCategory[],
): PlatformCategory | undefined {
  if (!rawCategory) return undefined;
  const normalized = normalize(rawCategory);
  return categories.find((category) => {
    const candidates = [
      category.key,
      category.label,
      ...category.synonyms,
      ...category.subcategories.flatMap((sub) => [
        sub.key,
        sub.label,
        ...sub.synonyms,
      ]),
    ];
    return candidates.some((candidate) => normalize(candidate) === normalized);
  });
}

function findSubcategory(
  serviceName: string,
  rawSubcategory: unknown,
  category: PlatformCategory | undefined,
) {
  if (!category) return undefined;
  const normalizedService = normalize(serviceName);
  const normalizedRaw =
    typeof rawSubcategory === "string" ? normalize(rawSubcategory) : "";

  return category.subcategories.find((subcategory) => {
    const candidates = [
      subcategory.key,
      subcategory.label,
      ...subcategory.synonyms,
    ];
    return candidates.some((candidate) => {
      const normalizedCandidate = normalize(candidate);
      return (
        normalizedCandidate === normalizedRaw ||
        normalizedService.includes(normalizedCandidate)
      );
    });
  });
}

function categorySynonyms(category: PlatformCategory | undefined): string[] {
  if (!category) return [];
  const normalizedLabel = normalize(category.label);
  return dedupe(
    [
      category.key,
      category.label,
      ...category.synonyms,
      ...(COMMON_SERVICE_SYNONYMS[normalizedLabel] ?? []),
      ...(COMMON_SERVICE_SYNONYMS[category.key] ?? []),
    ],
    MAX_SYNONYMS,
  );
}

function addToMap(map: Record<string, string[]>, key: string, value: string): void {
  const values = map[key] ?? [];
  if (!values.some((existing) => normalize(existing) === normalize(value))) {
    map[key] = [...values, value].sort((a, b) => a.localeCompare(b, "sr"));
  }
}

export function buildSemanticMemory(input: {
  salons: PlatformSalon[];
  services: PlatformService[];
  categories: PlatformCategory[];
}): SemanticMemory {
  const categories = input.categories.slice(0, MAX_CATEGORIES);
  const categoryItems: SemanticCategoryMemoryItem[] = categories.map((category) => ({
    key: category.key,
    label: category.label,
    synonyms: categorySynonyms(category),
    subcategories: category.subcategories.map((subcategory) => ({
      key: subcategory.key,
      label: subcategory.label,
      synonyms: dedupe([
        subcategory.key,
        subcategory.label,
        ...subcategory.synonyms,
      ]),
    })),
  }));

  const salonById = new Map<string, PlatformSalon>();
  for (const salon of input.salons) {
    const id = String(salon._id ?? salon.id ?? "");
    if (id) salonById.set(id, salon);
  }

  const byKey = new Map<string, SemanticServiceMemoryItem>();
  for (const rawService of input.services.slice(0, MAX_SERVICES * 2)) {
    const service = rawService as ServiceWithSalon;
    if (!service.name) continue;
    const serviceKey = String(service._id ?? service.id ?? keyFromLabel(service.name));
    const category = findCategory(service.category, categories);
    const subcategory = findSubcategory(service.name, service.subcategory, category);
    const salonId = service.salonId ?? String(service._salonId ?? "");
    const salon = salonId ? salonById.get(salonId) : undefined;
    const city = service.city ?? salon?.city;
    const salonName = service.salonName ?? salon?.name;
    const existing = byKey.get(serviceKey);
    const normalizedCategory = category ? normalize(category.label) : "";
    const synonyms = dedupe([
      ...(existing?.synonyms ?? []),
      service.name,
      category?.label,
      category?.key,
      subcategory?.label,
      subcategory?.key,
      ...categorySynonyms(category),
      ...(normalizedCategory ? COMMON_SERVICE_SYNONYMS[normalizedCategory] ?? [] : []),
      ...(category?.key ? COMMON_SERVICE_SYNONYMS[category.key] ?? [] : []),
    ]);

    byKey.set(serviceKey, {
      key: serviceKey,
      label: existing?.label ?? service.name,
      categoryKey: category?.key ?? existing?.categoryKey,
      categoryLabel: category?.label ?? existing?.categoryLabel ?? service.category,
      subcategoryKey: subcategory?.key ?? existing?.subcategoryKey,
      subcategoryLabel: subcategory?.label ?? existing?.subcategoryLabel,
      synonyms,
      cities: dedupe([...(existing?.cities ?? []), city], MAX_CITIES_PER_SERVICE),
      salonIds: dedupe([...(existing?.salonIds ?? []), salonId], MAX_SALONS_PER_SERVICE),
      salonNames: dedupe([...(existing?.salonNames ?? []), salonName], MAX_SALONS_PER_SERVICE),
    });
  }

  const serviceItems = [...byKey.values()].slice(0, MAX_SERVICES);
  const cityServiceMap: Record<string, string[]> = {};
  const serviceCityMap: Record<string, string[]> = {};

  for (const service of serviceItems) {
    for (const city of service.cities) {
      addToMap(cityServiceMap, city, service.label);
      addToMap(serviceCityMap, service.label, city);
    }
  }

  return {
    categories: categoryItems,
    services: serviceItems,
    cityServiceMap,
    serviceCityMap,
    summary: `${serviceItems.length} services across ${Object.keys(cityServiceMap).length} cities`,
  };
}

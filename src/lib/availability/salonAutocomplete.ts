import { normalizeWatchText } from "./availabilityWatchDedupe";

export interface SalonOption {
  id: string;
  name: string;
  city?: string;
  services?: Array<{ name: string; category: string }>;
}

export function normalizeSalonSearch(value: string): string {
  return normalizeWatchText(value);
}

/**
 * Returns up to `opts.limit` (default 8) salons whose name or city contains
 * the query. If `opts.city` is provided, salons in that city rank first;
 * non-matching cities are still included but appear after. If `opts.service`
 * is provided, salons that offer a matching service/category are preferred.
 */
export function filterSalonsForAutocomplete(
  salons: SalonOption[],
  query: string,
  opts: { city?: string; service?: string; limit?: number } = {},
): SalonOption[] {
  const { limit = 8 } = opts;
  const q = normalizeSalonSearch(query);
  if (!q) return [];

  const normCity = opts.city ? normalizeSalonSearch(opts.city) : undefined;
  const normService = opts.service ? normalizeSalonSearch(opts.service) : undefined;

  const filtered = salons.filter((s) => {
    const normName = normalizeSalonSearch(s.name);
    const normSalonCity = normalizeSalonSearch(s.city ?? "");
    return normName.includes(q) || normSalonCity.includes(q);
  });

  // Sort: city-match first, then service-match, then alphabetical.
  filtered.sort((a, b) => {
    const aCity = normalizeSalonSearch(a.city ?? "");
    const bCity = normalizeSalonSearch(b.city ?? "");
    const aCityMatch = normCity ? aCity === normCity : false;
    const bCityMatch = normCity ? bCity === normCity : false;
    if (aCityMatch !== bCityMatch) return aCityMatch ? -1 : 1;

    if (normService) {
      const aServiceMatch = (a.services ?? []).some(
        (sv) =>
          normalizeSalonSearch(sv.name).includes(normService) ||
          normalizeSalonSearch(sv.category).includes(normService),
      );
      const bServiceMatch = (b.services ?? []).some(
        (sv) =>
          normalizeSalonSearch(sv.name).includes(normService) ||
          normalizeSalonSearch(sv.category).includes(normService),
      );
      if (aServiceMatch !== bServiceMatch) return aServiceMatch ? -1 : 1;
    }

    return a.name.localeCompare(b.name, "sr");
  });

  return filtered.slice(0, limit);
}

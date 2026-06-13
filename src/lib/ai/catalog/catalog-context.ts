// src/lib/ai/catalog/catalog-context.ts
//
// Faza 2 — JEDAN intent leksikon iz živih podataka.
//
// CatalogContext je jedini izvor istine za prepoznavanje gradova, salona,
// usluga, kategorija i sinonima u korisničkom tekstu. Gradi se iz platforme
// (DB) — nikada iz hardkodiranih lista — i koriste ga:
//   - AgentEntryRouter (klijentski ruter)
//   - parseClaudiaDirectIntent (server, askAgent)
//   - Semantic Interpreter (preko platformKnowledge → isti izvor)
//   - Price / Booking / NotifyMe tokovi (preko parsera)
//   - Search query normalizacija (deli normalizator + semantičku mapu)
//
// Modul je čist i izomorfan: bez I/O, bez React-a. Server accessor je u
// get-catalog-context.ts; klijentska hidracija u client-catalog.ts.

import { SERVICE_SEMANTIC_MAP } from "@/lib/search/serviceSemanticMap";

// ── Serializable input (putuje kroz /api/ai/catalog ka klijentu) ─────────────

export interface CatalogData {
  cities: Array<{ name: string }>;
  salons: Array<{ id: string; name: string; city?: string }>;
  services: Array<{
    label: string;
    categoryLabel?: string;
    synonyms: string[];
    cities: string[];
  }>;
  categories: Array<{
    key: string;
    label: string;
    synonyms: string[];
    subcategories: Array<{ key: string; label: string; synonyms: string[] }>;
  }>;
}

export interface CatalogServiceMatch {
  service: string;
  category?: string;
}

export interface CatalogSalonMatch {
  id: string;
  name: string;
  city?: string;
}

export interface CatalogContext {
  data: CatalogData;
  /** Imena gradova iz kataloga (kanonski oblik). */
  cityNames: string[];
  /** Prvi (najraniji) pomenuti grad u tekstu. */
  matchCity(text: string): string | undefined;
  /** Poslednji pomenuti grad — pitanja se obično završavaju ciljnim gradom
   * ("...da li taj salon postoji i u Rumi?"). */
  matchLastCity(text: string): string | undefined;
  matchService(text: string): CatalogServiceMatch | undefined;
  matchSalon(text: string): CatalogSalonMatch | undefined;
  /** Brzi signali za rutiranje (AgentEntryRouter). */
  hasCityMention(text: string): boolean;
  hasServiceMention(text: string): boolean;
}

// ── Normalizacija — ista kao normalizeDirectText u askAgent-u ────────────────

export function normalizeCatalogText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "dj")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function boundaryRegex(term: string, allowSuffix: boolean): RegExp {
  const suffix = allowSuffix ? "\\w*" : "";
  return new RegExp(`(^|\\s)${escapeRegExp(term)}${suffix}(?=$|\\s|[,.!?;:])`);
}

// ── Padeži gradova — heuristika za srpske oblike ─────────────────────────────
//
// Generiše varijante po reči (lokativ/genitiv/akuzativ) pa ih kombinuje:
//   "Leskovac" → leskovac, leskovcu, leskovca
//   "Ruma"     → ruma, rumi, rume, rumu
//   "Novi Sad" → novi sad, novom sadu, novog sada
//   "Bor"      → bor, boru, bora

function wordVariants(word: string): { base: string; loc: string; gen: string } {
  if (word.endsWith("ac")) {
    const stem = word.slice(0, -2);
    return { base: word, loc: `${stem}cu`, gen: `${stem}ca` };
  }
  if (word.endsWith("i")) {
    // Pridev: "novi" → "novom" / "novog", "stari" → "starom"
    const stem = word.slice(0, -1);
    return { base: word, loc: `${stem}om`, gen: `${stem}og` };
  }
  if (word.endsWith("a")) {
    // Imenica/pridev ž. roda: "ruma" → "rumi"/"rume"; "stara" → "staroj"/"stare"
    const stem = word.slice(0, -1);
    return { base: word, loc: `${stem}i`, gen: `${stem}e` };
  }
  // Suglasnički završetak: "sad" → "sadu"/"sada", "bor" → "boru"/"bora"
  return { base: word, loc: `${word}u`, gen: `${word}a` };
}

export function cityNameVariants(cityName: string): string[] {
  const normalized = normalizeCatalogText(cityName);
  if (!normalized) return [];
  const words = normalized.split(" ").map(wordVariants);
  const join = (key: "base" | "loc" | "gen") =>
    words.map((w) => w[key]).join(" ");
  const variants = new Set<string>([join("base"), join("loc")]);
  // Genitiv samo za duža imena: za kratka pravi kolizije sa običnim rečima
  // ("Bora" ↔ bore na licu, "Niša" ↔ niša). Višerečna imena su bezbedna jer
  // se poklapa cela fraza.
  if (words.length > 1 || normalized.length > 4) {
    variants.add(join("gen"));
  }
  // Akuzativ ž. roda: "rumu" — samo za jednu reč na "a".
  if (words.length === 1 && normalized.endsWith("a")) {
    variants.add(`${normalized.slice(0, -1)}u`);
  }
  return [...variants];
}

// ── Salon matching — bez generičkih industrijskih reči ───────────────────────

const GENERIC_SALON_TOKENS = new Set([
  "salon",
  "saloni",
  "salona",
  "studio",
  "beauty",
  "frizerski",
  "frizerska",
  "kozmeticki",
  "kozmeticka",
  "nails",
  "hair",
  "spa",
]);

// ── Builder ──────────────────────────────────────────────────────────────────

interface ServiceTermEntry {
  term: string;
  service: string;
  category?: string;
}

export function buildCatalogContext(data: CatalogData): CatalogContext {
  // Gradovi: kanonsko ime → sve padežne varijante.
  const cityEntries = data.cities
    .map((city) => ({
      name: city.name,
      variants: cityNameVariants(city.name),
    }))
    .filter((entry) => entry.variants.length > 0)
    // Duže ime pre kraćeg ("Novi Sad" pre "Niš" je svejedno, ali
    // "Sremska Mitrovica" mora pre "Ruma" tipa podstringova).
    .sort((a, b) => b.name.length - a.name.length);

  // Usluge: sinonimi iz DB kategorija/usluga + statična semantička mapa kao
  // seed (proizvodno znanje o jeziku, ne duplikat DB podataka).
  const termEntries: ServiceTermEntry[] = [];
  const seenTerms = new Set<string>();
  const pushTerm = (term: string, service: string, category?: string) => {
    const normalized = normalizeCatalogText(term);
    if (normalized.length < 3 || seenTerms.has(normalized)) return;
    seenTerms.add(normalized);
    termEntries.push({ term: normalized, service, category });
  };

  for (const category of data.categories) {
    for (const syn of [category.label, category.key, ...category.synonyms]) {
      pushTerm(syn, category.label, category.label);
    }
    for (const sub of category.subcategories) {
      for (const syn of [sub.label, sub.key, ...sub.synonyms]) {
        pushTerm(syn, sub.label, category.label);
      }
    }
  }
  for (const service of data.services) {
    pushTerm(service.label, service.label, service.categoryLabel);
    for (const syn of service.synonyms) {
      pushTerm(syn, service.label, service.categoryLabel);
    }
  }
  for (const bucket of Object.values(SERVICE_SEMANTIC_MAP)) {
    for (const term of bucket.terms) {
      pushTerm(term, term, bucket.canonicalCategory);
    }
  }
  // Duži (specifičniji) termini imaju prednost: "tretman lica" pre "lice".
  termEntries.sort((a, b) => b.term.length - a.term.length);

  const salonEntries = data.salons
    .filter((salon) => salon.name)
    .map((salon) => {
      const normalized = normalizeCatalogText(salon.name);
      return {
        ...salon,
        normalized,
        distinctiveTokens: normalized
          .split(" ")
          .filter(
            (token) => token.length >= 4 && !GENERIC_SALON_TOKENS.has(token),
          ),
      };
    });

  const findCityMatches = (
    text: string,
  ): Array<{ name: string; index: number }> => {
    const normalized = normalizeCatalogText(text);
    if (!normalized) return [];
    const matches: Array<{ name: string; index: number }> = [];
    for (const entry of cityEntries) {
      let bestIndex = -1;
      for (const variant of entry.variants) {
        if (!normalized.includes(variant)) continue;
        const match = boundaryRegex(variant, false).exec(normalized);
        if (!match) continue;
        const index = match.index + (match[1]?.length ?? 0);
        if (bestIndex === -1 || index < bestIndex) bestIndex = index;
      }
      if (bestIndex >= 0) matches.push({ name: entry.name, index: bestIndex });
    }
    return matches.sort((a, b) => a.index - b.index);
  };

  const matchCity = (text: string): string | undefined =>
    findCityMatches(text)[0]?.name;

  const matchLastCity = (text: string): string | undefined =>
    findCityMatches(text).at(-1)?.name;

  const matchService = (text: string): CatalogServiceMatch | undefined => {
    const normalized = normalizeCatalogText(text);
    if (!normalized) return undefined;
    for (const entry of termEntries) {
      // Brzi prefilter pre regex-a; sufiks \w* pokriva padeže usluga
      // ("masazu", "masaze" → termin "masaza" se seče na koren ispod).
      const stem =
        entry.term.length > 5 ? entry.term.slice(0, -1) : entry.term;
      if (!normalized.includes(stem)) continue;
      if (
        boundaryRegex(entry.term, true).test(normalized) ||
        (entry.term.length > 5 && boundaryRegex(stem, true).test(normalized))
      ) {
        return { service: entry.service, category: entry.category };
      }
    }
    return undefined;
  };

  const matchSalon = (text: string): CatalogSalonMatch | undefined => {
    const normalized = normalizeCatalogText(text);
    if (!normalized) return undefined;
    const found = salonEntries.find(
      (salon) =>
        normalized.includes(salon.normalized) ||
        salon.distinctiveTokens.some((token) =>
          boundaryRegex(token, true).test(normalized),
        ),
    );
    return found
      ? { id: found.id, name: found.name, city: found.city }
      : undefined;
  };

  return {
    data,
    cityNames: cityEntries.map((entry) => entry.name),
    matchCity,
    matchLastCity,
    matchService,
    matchSalon,
    hasCityMention: (text) => matchCity(text) !== undefined,
    hasServiceMention: (text) => matchService(text) !== undefined,
  };
}

// ── Adapter iz PlatformKnowledge (server) ───────────────────────────────────

export interface PlatformKnowledgeLike {
  citiesText?: string;
  raw?: {
    salons: Array<{
      _id?: unknown;
      id?: unknown;
      name?: string;
      city?: string;
    }>;
    services: Array<{
      name?: string;
      category?: string;
      city?: string;
    }>;
    categories: Array<{
      key: string;
      label: string;
      synonyms: string[];
      subcategories: Array<{ key: string; label: string; synonyms: string[] }>;
    }>;
  };
  semanticMemory?: {
    services: Array<{
      label: string;
      categoryLabel?: string;
      synonyms: string[];
      cities: string[];
    }>;
  };
}

export function catalogDataFromPlatformKnowledge(
  platform: PlatformKnowledgeLike,
): CatalogData {
  const cities = (platform.citiesText ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name }));

  const salons = (platform.raw?.salons ?? [])
    .filter((salon) => salon.name)
    .map((salon) => ({
      id: String(salon._id ?? salon.id ?? ""),
      name: salon.name as string,
      city: salon.city,
    }));

  // Prefer semanticMemory services (već nose sinonime); fallback na raw.
  const services = platform.semanticMemory?.services?.length
    ? platform.semanticMemory.services.map((service) => ({
        label: service.label,
        categoryLabel: service.categoryLabel,
        synonyms: service.synonyms,
        cities: service.cities,
      }))
    : (platform.raw?.services ?? [])
        .filter((service) => service.name)
        .map((service) => ({
          label: service.name as string,
          categoryLabel: service.category,
          synonyms: [],
          cities: service.city ? [service.city] : [],
        }));

  const categories = (platform.raw?.categories ?? []).map((category) => ({
    key: category.key,
    label: category.label,
    synonyms: category.synonyms ?? [],
    subcategories: (category.subcategories ?? []).map((sub) => ({
      key: sub.key,
      label: sub.label,
      synonyms: sub.synonyms ?? [],
    })),
  }));

  return { cities, salons, services, categories };
}

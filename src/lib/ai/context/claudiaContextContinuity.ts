// src/lib/ai/context/claudiaContextContinuity.ts
//
// Task 3 — Claudia Context Continuity.
//
// Problem koji rešava:
//   Claudia zna grad/uslugu/salon iz prve poruke, ali follow-up poruke
//   dolaze bez tog konteksta pa Claudia ponovo pita iste stvari.
//
// Rešenje:
//   1. ClaudiaQueryContext — tip koji opisuje šta je poznato iz prethodnih tura
//   2. mergeClaudiaContext() — spaja novi intent sa prethodnim kontekstom
//   3. sanitizeClaudiaMessage() — eliminiše "undefined", "null", "tražena usluga"
//   4. inferCityFromSalon() — ako je salon poznat, grad se može izvući
//   5. resolveNearestCandidatesForCity() — najbliži gradovi za grad bez salona
//
// Šta se NE menja:
//   - AgentEntryRouter
//   - BookingWorkflow / BookingFlow state machine
//   - Search engine / runBookingSearch
//   - LayoutEngine / UICommandExecutor
//   - Nijedan novi memory layer

import type { CollectedBookingFields } from "@/lib/ai/booking-flow-state";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ClaudiaQueryType =
  | "booking"
  | "prices"
  | "city_availability"
  | "appointments"
  | "auth"
  | "unknown";

export interface ClaudiaQueryContext {
  /** Tip poslednjeg upita — određuje kako se follow-up tumači */
  lastQueryType: ClaudiaQueryType;

  // Booking / prices context
  city?: string;
  service?: string;
  category?: string;
  salonId?: string;
  salonName?: string;
  date?: string;
  dateMode?: string;
  time?: string;
  timeWindowStart?: number | null;
  timeWindowEnd?: number | null;

  // City availability context
  requestedCity?: string;
  /**
   * Gradovi ponuđeni kao alternative kada requestedCity nema salon.
   * Follow-up "Feniranje" treba da traži samo u ovim gradovima,
   * ne u globalnoj listi.
   */
  nearestCityCandidates?: string[];

  // Price context
  /**
   * Usluge koje su bile prikazane u poslednjem price odgovoru.
   * "Koje vrste feniranja ima?" koristi ovo umesto da pita ponovo.
   */
  matchingServiceNames?: string[];
}

// ---------------------------------------------------------------------------
// Merge — nova informacija pobeduje, stara se čuva ako nema nove
// ---------------------------------------------------------------------------

/**
 * Spaja novi direktni intent sa prethodnim kontekstom.
 * Pravila:
 * - Eksplicitna nova vrednost uvek pobeđuje staru
 * - Ako nova vrednost nije prisutna, koristi staru
 * - nearestCityCandidates se resetuje samo ako se promenio requestedCity
 */
export function mergeClaudiaContext(
  previous: ClaudiaQueryContext | undefined,
  next: {
    queryType: ClaudiaQueryType;
    city?: string;
    service?: string;
    category?: string;
    salonId?: string;
    salonName?: string;
    date?: string;
    dateMode?: string;
    time?: string;
    timeWindowStart?: number | null;
    timeWindowEnd?: number | null;
    requestedCity?: string;
    nearestCityCandidates?: string[];
    matchingServiceNames?: string[];
  },
): ClaudiaQueryContext {
  const prev = previous ?? { lastQueryType: "unknown" };

  // Grad koji se koristi kao anchor — novi explicit pobeduje
  const city = next.city ?? prev.city;
  const service = next.service ?? prev.service;
  const category = next.category ?? prev.category;
  const salonId = next.salonId ?? prev.salonId;
  const salonName = next.salonName ?? prev.salonName;

  // Date/time — novi pobeduje, stari se čuva samo ako nema novi
  const date = next.date ?? prev.date;
  const dateMode = next.dateMode ?? prev.dateMode;
  const time = next.time ?? prev.time;
  const timeWindowStart =
    next.timeWindowStart !== undefined ? next.timeWindowStart : prev.timeWindowStart;
  const timeWindowEnd =
    next.timeWindowEnd !== undefined ? next.timeWindowEnd : prev.timeWindowEnd;

  // requestedCity — za city_availability flow
  const requestedCity = next.requestedCity ?? prev.requestedCity;

  // nearestCityCandidates — resetuj samo ako se promenio requestedCity
  const nearestCityCandidates =
    next.nearestCityCandidates ??
    (next.requestedCity && next.requestedCity !== prev.requestedCity
      ? undefined
      : prev.nearestCityCandidates);

  // matchingServiceNames — iz price odgovora
  const matchingServiceNames =
    next.matchingServiceNames ?? prev.matchingServiceNames;

  return {
    lastQueryType: next.queryType,
    city,
    service,
    category,
    salonId,
    salonName,
    date,
    dateMode,
    time,
    timeWindowStart,
    timeWindowEnd,
    requestedCity,
    nearestCityCandidates,
    matchingServiceNames,
  };
}

// ---------------------------------------------------------------------------
// CollectedBookingFields → ClaudiaQueryContext bridge
// ---------------------------------------------------------------------------

/**
 * Konvertuje CollectedBookingFields (booking flow state) u ClaudiaQueryContext.
 * Koristi se na početku svakog askAgent poziva da bootstrapuje kontekst
 * iz postojećeg booking flow stanja.
 */
export function collectedToContext(
  collected: CollectedBookingFields | undefined,
  queryType: ClaudiaQueryType = "booking",
): ClaudiaQueryContext {
  if (!collected) return { lastQueryType: queryType };
  return {
    lastQueryType: queryType,
    city: collected.city,
    service: collected.service ?? collected.serviceName,
    category: collected.category,
    salonId: collected.salonId,
    salonName: collected.salonName,
    date: collected.date,
    time: collected.time,
    timeWindowStart: collected.timeWindowStart,
    timeWindowEnd: collected.timeWindowEnd,
  };
}

/**
 * Konvertuje ClaudiaQueryContext nazad u CollectedBookingFields za bookingFlow.collect().
 */
export function contextToCollected(ctx: ClaudiaQueryContext): Partial<CollectedBookingFields> {
  return {
    ...(ctx.city ? { city: ctx.city } : {}),
    ...(ctx.service ? { service: ctx.service } : {}),
    ...(ctx.category ? { category: ctx.category } : {}),
    ...(ctx.salonId ? { salonId: ctx.salonId } : {}),
    ...(ctx.salonName ? { salonName: ctx.salonName } : {}),
    ...(ctx.date ? { date: ctx.date } : {}),
    ...(ctx.time ? { time: ctx.time } : {}),
    ...(ctx.timeWindowStart !== undefined ? { timeWindowStart: ctx.timeWindowStart } : {}),
    ...(ctx.timeWindowEnd !== undefined ? { timeWindowEnd: ctx.timeWindowEnd } : {}),
  };
}

// ---------------------------------------------------------------------------
// City inference from salon
// ---------------------------------------------------------------------------

export interface SalonRecord {
  id?: string;
  _id?: unknown;
  name?: string;
  city?: string;
}

/**
 * Ako je salon poznat a grad nije, pokušaj da izvučeš grad iz baze salona.
 * "Kiki Kiss šminkanje u nedelju" → salon Kiki Kiss → city=Beograd
 */
export function inferCityFromSalon(
  salonName: string | undefined,
  salonId: string | undefined,
  salons: SalonRecord[],
): string | undefined {
  if (!salonName && !salonId) return undefined;

  const normalizeForMatch = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  if (salonId) {
    const byId = salons.find(
      (s) => String(s._id ?? s.id ?? "") === salonId,
    );
    if (byId?.city) return byId.city;
  }

  if (salonName) {
    // Generic salon-industry words must never count as a name match —
    // otherwise "Nepoznat Salon" matches "Shi Sham Frizerski Salon" via the
    // shared token "salon" and we invent a city for a salon we don't have.
    const GENERIC_SALON_TOKENS = new Set([
      "salon",
      "saloni",
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
    const normalizedQuery = normalizeForMatch(salonName);
    const byName = salons.find((s) => {
      if (!s.name) return false;
      const n = normalizeForMatch(s.name);
      return (
        n.includes(normalizedQuery) ||
        normalizedQuery.includes(n) ||
        // Partial match — "Kiki Kiss" matches "Kiki Kiss Beauty", but only
        // on distinctive tokens, never on generic industry words.
        n.split(" ").some(
          (part) =>
            part.length >= 4 &&
            !GENERIC_SALON_TOKENS.has(part) &&
            normalizedQuery.includes(part),
        )
      );
    });
    if (byName?.city) return byName.city;
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Nearest city candidates
// ---------------------------------------------------------------------------

/** Statička proksimitet mapa — dovoljno za MVP bez geo API-ja */
const CITY_PROXIMITY: Record<string, string[]> = {
  Ruma: ["Novi Sad", "Beograd", "Sremska Mitrovica"],
  Leskovac: ["Niš", "Beograd", "Vranje"],
  Niš: ["Leskovac", "Beograd", "Prokuplje"],
  Subotica: ["Novi Sad", "Sombor", "Beograd"],
  Zrenjanin: ["Novi Sad", "Beograd", "Pančevo"],
  Valjevo: ["Beograd", "Šabac", "Čačak"],
  Šabac: ["Beograd", "Valjevo", "Sremska Mitrovica"],
  Čačak: ["Beograd", "Kragujevac", "Kraljevo"],
  Kruševac: ["Beograd", "Niš", "Kragujevac"],
  Jagodina: ["Beograd", "Kragujevac", "Ćuprija"],
  "Sremska Mitrovica": ["Novi Sad", "Beograd", "Ruma"],
  Pančevo: ["Beograd", "Zrenjanin", "Novi Sad"],
  Smederevo: ["Beograd", "Požarevac", "Pančevo"],
  Vranje: ["Niš", "Leskovac", "Beograd"],
  Pirot: ["Niš", "Zaječar", "Beograd"],
  Zaječar: ["Beograd", "Pirot", "Niš"],
  Požarevac: ["Beograd", "Smederevo", "Zaječar"],
  Sombor: ["Novi Sad", "Subotica", "Beograd"],
  Kikinda: ["Novi Sad", "Zrenjanin", "Subotica"],
};

/**
 * Vraća listu gradova koji imaju salone a su blizu requestedCity.
 * Koristi se kada Claudia kaže "nemamo u Rumi" —
 * sledeći follow-up treba da pretražuje samo u ovim gradovima.
 */
export function resolveNearestCandidatesForCity(
  requestedCity: string,
  availableCities: string[],
): string[] {
  const available = new Set(availableCities.map((c) => c.toLowerCase()));

  // Provjeri statičku mapu
  const staticCandidates = CITY_PROXIMITY[requestedCity] ?? [];
  const fromStatic = staticCandidates.filter((c) =>
    available.has(c.toLowerCase()),
  );
  if (fromStatic.length > 0) return fromStatic.slice(0, 3);

  // Fallback — vrati sve dostupne gradove (max 3)
  return availableCities.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Message sanitizer — Task 5
// ---------------------------------------------------------------------------

const PLACEHOLDER_PATTERNS: Array<[RegExp, string]> = [
  [/\btražena usluga\b/gi, "ovu uslugu"],
  [/\bnepoznata usluga\b/gi, "ovu uslugu"],
  [/\bu undefined\b/gi, ""],
  [/\bundefined\b/gi, ""],
  [/\bnull\b/gi, ""],
  // "za undefined u Beogradu" → "u Beogradu"
  [/\bza undefined\b/gi, ""],
  // "termin za null" → "termin"
  [/\bza null\b/gi, ""],
];

/**
 * Sanitizuje vidljivu poruku korisniku — uklanja placeholder vrednosti.
 * Ako je poruka posle sanitizacije prazna ili besmislena, zamenjuje je
 * jednim jasnim pitanjem.
 */
export function sanitizeClaudiaMessage(
  message: string,
  context?: Partial<ClaudiaQueryContext>,
): string {
  if (!message) return buildFallbackQuestion(context);

  let sanitized = message;
  for (const [pattern, replacement] of PLACEHOLDER_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }

  // Čišćenje višestrukih razmaka nastalih brisanjem
  sanitized = sanitized.replace(/\s{2,}/g, " ").trim();
  // Čišćenje " u ." ili "za ." koji ostanu posle brisanja
  sanitized = sanitized.replace(/\s+[iu]\s*\./g, ".").trim();
  sanitized = sanitized.replace(/\s+za\s*\./g, ".").trim();

  if (sanitized.length < 5) {
    return buildFallbackQuestion(context);
  }

  return sanitized;
}

function buildFallbackQuestion(context?: Partial<ClaudiaQueryContext>): string {
  if (context?.lastQueryType === "prices") {
    if (!context.service) return "Za koju uslugu?";
    if (!context.city && !context.salonName) return `Za koji grad ili salon za ${context.service}?`;
  }
  if (context?.lastQueryType === "city_availability") {
    if (context.nearestCityCandidates?.length) {
      return `Koji termin vas zanima u ${context.nearestCityCandidates.slice(0, 2).join(" ili ")}?`;
    }
    return "Koja usluga vas zanima?";
  }
  if (context?.lastQueryType === "booking") {
    if (!context.service) return "Koja usluga vas zanima?";
    if (!context.city) return "Za koji grad?";
  }
  return "Možeš li da pojasniš šta tražiš?";
}

// ---------------------------------------------------------------------------
// Follow-up resolution — da li poruka samo dodaje jednu dimenziju
// ---------------------------------------------------------------------------

export interface FollowUpResolution {
  /** True ako je poruka samo dopuna prethodnog konteksta */
  isFollowUp: boolean;
  /** Šta je novo u ovoj poruci */
  addedDimension?: "city" | "service" | "time" | "date" | "salon" | "unknown";
  /** Merged kontekst spreman za korišćenje */
  mergedContext: ClaudiaQueryContext;
}

/**
 * Detektuje da li je nova poruka follow-up prethodnog konteksta.
 * Koristi se pre LLM poziva da prepozna "Beograd" posle "Za koji grad za feniranje?"
 * bez potrebe za LLM-om.
 *
 * Pravilo: ako poruka sadrži samo jedan entitet (grad/usluga/vreme/salon)
 * i postoji prethodni kontekst sa bar jednim poznatim poljem —
 * tretira se kao follow-up i ne restartuje flow.
 */
export function resolveFollowUp(
  userText: string,
  previous: ClaudiaQueryContext | undefined,
  detected: {
    city?: string;
    service?: string;
    category?: string;
    salonName?: string;
    date?: string;
    dateMode?: string;
    time?: string;
    timeWindowStart?: number | null;
    timeWindowEnd?: number | null;
  },
): FollowUpResolution {
  if (!previous || previous.lastQueryType === "unknown") {
    return {
      isFollowUp: false,
      mergedContext: mergeClaudiaContext(previous, {
        queryType: "booking",
        ...detected,
      }),
    };
  }

  // Koliko dimenzija sadrži nova poruka?
  const newDimensions = [
    detected.city,
    detected.service ?? detected.category,
    detected.time ?? (detected.timeWindowStart != null ? "time" : undefined),
    detected.date ?? detected.dateMode,
    detected.salonName,
  ].filter(Boolean).length;

  // Koliko dimenzija već postoji u prethodnom kontekstu?
  const existingDimensions = [
    previous.city,
    previous.service ?? previous.category,
    previous.time ?? (previous.timeWindowStart != null ? "time" : undefined),
    previous.date ?? previous.dateMode,
    previous.salonName,
  ].filter(Boolean).length;

  const isFollowUp = existingDimensions >= 1 && newDimensions <= 2;

  let addedDimension: FollowUpResolution["addedDimension"];
  if (detected.city && !previous.city) addedDimension = "city";
  else if ((detected.service ?? detected.category) && !previous.service) addedDimension = "service";
  else if (detected.salonName && !previous.salonName) addedDimension = "salon";
  else if (detected.date ?? detected.dateMode) addedDimension = "date";
  else if (detected.time ?? detected.timeWindowStart != null) addedDimension = "time";
  else addedDimension = "unknown";

  const mergedContext = mergeClaudiaContext(previous, {
    queryType: previous.lastQueryType,
    ...detected,
  });

  return { isFollowUp, addedDimension, mergedContext };
}

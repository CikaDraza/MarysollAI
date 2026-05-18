// src/tests/parseIntent.test.ts
//
// Batch 4 — fuzzy synonym lookup + prekosutra/time-window combinations.
import { parseIntent } from "@/lib/intent/parseIntent";
import {
  normalizeServiceQuery,
  isKnownService,
  buildDynamicSynonymMap,
} from "@/lib/intent/serviceSynonyms";
import {
  levenshtein,
  fuzzyToleranceFor,
  findFuzzyMatch,
} from "@/lib/intent/fuzzyMatch";

describe("fuzzyMatch", () => {
  test("levenshtein computes edit distance", () => {
    expect(levenshtein("sisanje", "sisanje")).toBe(0);
    expect(levenshtein("sisanj", "sisanje")).toBe(1);
    expect(levenshtein("manukur", "manikir")).toBe(2);
    expect(levenshtein("bbalayage", "balayage")).toBe(1);
    expect(levenshtein("", "abc")).toBe(3);
  });

  test("tolerance scales with input length", () => {
    expect(fuzzyToleranceFor(3)).toBe(0); // too short → no fuzzy
    expect(fuzzyToleranceFor(4)).toBe(1);
    expect(fuzzyToleranceFor(5)).toBe(1);
    expect(fuzzyToleranceFor(6)).toBe(2);
    expect(fuzzyToleranceFor(8)).toBe(2);
    expect(fuzzyToleranceFor(12)).toBe(3);
  });

  test("findFuzzyMatch returns closest candidate within tolerance", () => {
    const candidates = ["sisanje", "manikir", "masaza"];
    expect(findFuzzyMatch("sisanj", candidates)).toBe("sisanje");
    expect(findFuzzyMatch("manukur", candidates)).toBe("manikir");
    expect(findFuzzyMatch("xyzzz", candidates)).toBeNull();
  });

  test("findFuzzyMatch rejects too-short inputs", () => {
    // 3-char input → no fuzzy match (would be ambiguous).
    expect(findFuzzyMatch("abc", ["abcd", "abce"])).toBeNull();
  });
});

describe("normalizeServiceQuery", () => {
  test("exact match wins (passthrough for unknown)", () => {
    expect(normalizeServiceQuery("Šišanje")).toBe("sisanje");
    expect(normalizeServiceQuery("haircut")).toBe("sisanje");
    expect(normalizeServiceQuery("xyz")).toBe("xyz");
  });

  test("fuzzy fallback catches typos", () => {
    // "sisanj" is 1 char away from "sisanje"
    expect(normalizeServiceQuery("sisanj")).toBe("sisanje");
    // "manukur" is 2 chars away from "manikir"
    expect(normalizeServiceQuery("manukur")).toBe("manikir");
    // "bbalayage" is 1 char extra vs static synonym "balayage" (→ "pramenovi")
    expect(normalizeServiceQuery("bbalayage")).toBe("pramenovi");
  });

  test("fuzzy is skipped for too-short inputs", () => {
    // 3-char input "fen" is an exact key — but "fxn" (3 chars, 1 away) is
    // too short to fuzzy-resolve. Should pass through unchanged.
    expect(normalizeServiceQuery("fxn")).toBe("fxn");
  });

  test("dynamic DB synonyms beat static fallback", () => {
    const categories = [
      {
        key: "hair",
        label: "Kosa",
        synonyms: [],
        subcategories: [
          {
            key: "akrilne-nadogradnje",
            label: "Akrilne nadogradnje",
            synonyms: ["akril", "akrilik"],
          },
        ],
      },
    ];
    const dyn = buildDynamicSynonymMap(categories);
    expect(normalizeServiceQuery("akril", dyn)).toBe("akrilne-nadogradnje");
    // Without the dynamic map, "akril" still resolves to the static
    // "nadogradnja" entry.
    expect(normalizeServiceQuery("akril")).toBe("nadogradnja");
  });
});

describe("isKnownService", () => {
  test("returns true for exact and fuzzy matches", () => {
    expect(isKnownService("šišanje")).toBe(true);
    expect(isKnownService("sisanj")).toBe(true); // fuzzy
    expect(isKnownService("haircut")).toBe(true);
    expect(isKnownService("xyz")).toBe(false);
  });
});

describe("parseIntent — prekosutra", () => {
  test("prekosutra resolves to day_after_tomorrow with ISO value", () => {
    const intent = parseIntent("prekosutra masaža");
    expect(intent.datetime.type).toBe("day_after_tomorrow");
    expect(intent.datetime.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(intent.category).toBe("massage");
  });

  test("prekosutra is not swallowed by sutra check", () => {
    // Regression guard: norm.includes("sutra") is true for "prekosutra" too,
    // so the prekosutra branch must run first.
    const intent = parseIntent("prekosutra ujutru obrve");
    expect(intent.datetime.type).toBe("day_after_tomorrow");
    expect(intent.datetime.time).toBe("09:00");
    expect(intent.datetime.timeWindowStart).toBe(8);
    expect(intent.datetime.timeWindowEnd).toBe(12);
  });

  test("day after tomorrow (English) also resolves", () => {
    const intent = parseIntent("day after tomorrow afternoon haircut");
    expect(intent.datetime.type).toBe("day_after_tomorrow");
    expect(intent.datetime.timeWindowStart).toBe(12);
    expect(intent.datetime.timeWindowEnd).toBe(17);
  });
});

describe("parseIntent — date + time-window combinations", () => {
  test("sutra + popodne combines date and window in one pass", () => {
    const intent = parseIntent("sutra popodne sisanje");
    expect(intent.datetime.type).toBe("tomorrow");
    expect(intent.datetime.timeWindowStart).toBe(12);
    expect(intent.datetime.timeWindowEnd).toBe(17);
    expect(intent.category).toBe("hair");
  });

  test("danas + uvece keeps both signals", () => {
    const intent = parseIntent("danas uveče manikir");
    expect(intent.datetime.type).toBe("today");
    expect(intent.datetime.timeWindowStart).toBe(18);
    expect(intent.datetime.timeWindowEnd).toBe(22);
  });

  test("weekday + ujutru resolves to specific date with morning window", () => {
    const intent = parseIntent("subotom ujutru obrve");
    expect(intent.datetime.type).toBe("date");
    expect(intent.datetime.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(intent.datetime.timeWindowStart).toBe(8);
  });
});

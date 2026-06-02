/**
 * GET /api/search/intent?q=...
 *
 * AI-only layer: sends raw user text to DeepSeek, returns structured booking intent JSON.
 * No slot fetching here — pure intent extraction + validation.
 */

import { NextResponse } from "next/server";
import { SERBIAN_CITIES } from "@/lib/cities";
import { ensureCityCatalog } from "@/lib/cities-runtime";
import { VALID_CATEGORY_SLUGS } from "@/lib/intent/categoryMap";
import { stripDiacritics } from "@/lib/intent/parseIntent";
import { todayInBelgrade, tomorrowInBelgrade } from "@/lib/search/normalizeSearch";
import { fetchCategories } from "@/lib/search/fetchCategories";
import type { PlatformCategory } from "@/types/category-types";
import type { ParsedIntent, IntentType } from "@/types/intent";

const VALID_INTENT_TYPES = new Set<string>([
  "availability_search",
  "urgent_booking",
  "inspiration",
  "price_check",
  "salon_discovery",
]);

const CITY_LIST = SERBIAN_CITIES.map((c) => c.name).join(", ");

function buildCategorySection(categories: PlatformCategory[]): string {
  return categories
    .map((cat) => {
      const allTerms = [
        cat.label,
        ...cat.synonyms,
        ...cat.subcategories.flatMap((s) => [s.label, ...s.synonyms]),
      ].filter(Boolean);
      const unique = [...new Set(allTerms)].join(", ");
      return `- "${cat.key}" — ${unique}`;
    })
    .join("\n");
}

function buildSystemPrompt(
  today: string,
  tomorrow: string,
  categories: PlatformCategory[],
): string {
  const categorySection = categories.length
    ? buildCategorySection(categories)
    : `- "massage"  — masaža, masaže, maderoterapija, anticelulit, limfna drenaža, relaks
- "nails"    — nokti, manikir, pedikir, gel lak, izlivanje noktiju, nadogradnja, akril, french, tipse
- "hair"     — kosa, šišanje, frizura, pramen, bojanje, balayage, highlights, keratin, brijanje
- "makeup"   — šminka, makeup, make-up, vjenčanje šminka, svadba šminka
- "waxing"   — depilacija, vosak, vaks, laser depilacija, sugaring
- "eyebrows" — obrve, trepavice, microblading, laminacija obrva, brow lift, threading
- "facial"   — tretman lica, čišćenje lica, peeling, microneedling, derma, botoks, hijaluron
- "body"     — oblikovanje tela, kavitacija, RF, vakuum, termo, slim`;

  return `You are a booking intent extraction engine for a Serbian beauty salon platform.
Extract booking intent from user input (Serbian or English natural language).
Return ONLY valid JSON — no prose, no markdown, no explanation.

Today is ${today}. Tomorrow is ${tomorrow}. Timezone: Europe/Belgrade.

CATEGORY SLUGS (use ONLY these values for categoryKey, or null):
${categorySection}

INTENT TYPES:
- "availability_search" — looking for a free slot (DEFAULT — use when unsure)
- "urgent_booking"      — hitno, odmah, što pre, asap, danas hitno
- "inspiration"         — browsing without urgency: "šta ima", "gledam tretmane", "ima li nešto"
- "price_check"         — asking about price: "koliko košta", "cena", "cene"
- "salon_discovery"     — looking for a salon without specific service: "koji saloni", "gde mogu"

SERBIAN CITIES (use EXACT spelling from this list, or null if not mentioned):
${CITY_LIST}

TIME EXTRACTION RULES:
- "večeras", "uveče"            → from: "18:00", to: "22:00"
- "popodne", "poslepodne"       → from: "12:00", to: "17:00"
- "ujutru", "jutros", "prepodne"→ from: "08:00", to: "12:00"
- "posle radnog vremena"        → from: "17:00", to: null
- "posle 14", "nakon 14h"       → from: "14:00", to: null
- "oko 15", "around 3pm"        → from: "14:00", to: "16:00"
- explicit "15:30"              → from: "15:30", to: "16:30"
- no time mentioned             → from: null, to: null

DATE EXTRACTION RULES:
- "danas", "today"    → "${today}"
- "sutra", "tomorrow" → "${tomorrow}"
- weekday (ponedeljak=Monday, utorak=Tuesday, sreda=Wednesday, četvrtak=Thursday, petak=Friday, subota=Saturday, nedelja=Sunday) → next upcoming ISO date
- no date mentioned   → null

OUTPUT (return ONLY this JSON, no other text):
{
  "city": "Novi Sad",
  "categoryKey": "massage",
  "subcategoryKey": "maderoterapija",
  "date": "${today}",
  "timeRange": { "from": "18:00", "to": "22:00" },
  "intentType": "availability_search",
  "confidence": { "city": 0.98, "category": 0.95, "time": 0.90 }
}`;
}

function validateAndSanitize(
  raw: Record<string, unknown>,
  validKeys: Set<string>,
): ParsedIntent {
  // city — must be an exact match (case-insensitive + diacritics-stripped) from SERBIAN_CITIES
  let city: string | null = null;
  if (typeof raw.city === "string" && raw.city.trim()) {
    const norm = stripDiacritics(raw.city.trim());
    const found = SERBIAN_CITIES.find((c) => stripDiacritics(c.name) === norm);
    city = found?.name ?? null;
  }

  // categoryKey — validate against DB keys (falls back to hardcoded set if DB unavailable)
  let categoryKey: ParsedIntent["categoryKey"] = null;
  if (typeof raw.categoryKey === "string" && validKeys.has(raw.categoryKey)) {
    categoryKey = raw.categoryKey as ParsedIntent["categoryKey"];
  }

  // subcategoryKey — free text, sanitize to string or null
  const subcategoryKey =
    typeof raw.subcategoryKey === "string" && raw.subcategoryKey.trim()
      ? raw.subcategoryKey.trim()
      : null;

  // date — must be YYYY-MM-DD
  const date =
    typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)
      ? raw.date
      : null;

  // timeRange
  const tr = (raw.timeRange ?? {}) as Record<string, unknown>;
  const timeFrom =
    typeof tr.from === "string" && /^\d{2}:\d{2}$/.test(tr.from)
      ? tr.from
      : null;
  const timeTo =
    typeof tr.to === "string" && /^\d{2}:\d{2}$/.test(tr.to) ? tr.to : null;

  // intentType — default to availability_search
  const intentType: IntentType =
    typeof raw.intentType === "string" && VALID_INTENT_TYPES.has(raw.intentType)
      ? (raw.intentType as IntentType)
      : "availability_search";

  // confidence — clamp to [0, 1]
  const conf = (raw.confidence ?? {}) as Record<string, unknown>;
  const clamp = (v: unknown) =>
    typeof v === "number" ? Math.min(1, Math.max(0, v)) : 0;

  return {
    city,
    categoryKey,
    subcategoryKey,
    date,
    timeRange: { from: timeFrom, to: timeTo },
    intentType,
    confidence: {
      city: clamp(conf.city),
      category: clamp(conf.category),
      time: clamp(conf.time),
    },
  };
}

export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json({ error: "Missing query parameter: q" }, { status: 400 });
  }

  // Hydrate the dynamic city catalog so the DeepSeek prompt + validation see
  // every marketplace city, not just the static fallback list.
  await ensureCityCatalog();

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "DeepSeek API key not configured" },
      { status: 500 },
    );
  }

  const today = todayInBelgrade();
  const tomorrow = tomorrowInBelgrade();
  const categories = await fetchCategories();
  const validKeys =
    categories.length > 0
      ? new Set(categories.map((c) => c.key))
      : VALID_CATEGORY_SLUGS;

  console.log(`[/api/search/intent] q="${q}" categories=${categories.length}`);

  let rawJson: Record<string, unknown>;
  try {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: buildSystemPrompt(today, tomorrow, categories) },
          { role: "user", content: q },
        ],
        temperature: 0,
        max_tokens: 300,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[/api/search/intent] DeepSeek error:", res.status, text);
      return NextResponse.json({ error: "LLM call failed" }, { status: 502 });
    }

    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    const content = data.choices[0]?.message?.content ?? "{}";
    rawJson = JSON.parse(content) as Record<string, unknown>;
  } catch (err) {
    console.error("[/api/search/intent] error:", err);
    return NextResponse.json(
      { error: "Failed to parse LLM response" },
      { status: 500 },
    );
  }

  const intent = validateAndSanitize(rawJson, validKeys);
  console.log("[/api/search/intent] →", intent);

  return NextResponse.json(intent, { headers: { "Cache-Control": "no-store" } });
}

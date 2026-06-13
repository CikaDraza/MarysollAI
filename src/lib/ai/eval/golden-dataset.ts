// src/lib/ai/eval/golden-dataset.ts
//
// Faza 8 — golden eval dataset za A/B test modela (srpski). Pokriva: intent
// (booking/prices/appointments/FAQ/B2B/closure), višeturni kontekst, korekcije
// ("nisam to želeo"), padeže i tekst bez dijakritika, i nepostojeće
// gradove/usluge (test halucinacija). Svaki slučaj ima očekivani intent,
// entitete i routing — sve nad MariaContract ruter oblikom.

import type { GoldenExpectation } from "./eval-metrics";

export interface GoldenCase {
  id: string;
  message: string;
  context?: Array<{ role: "user" | "assistant"; content: string }>;
  expect: GoldenExpectation;
  note?: string;
}

// Mali, samostalan katalog za grounding (nezavisan od platform fetch-a).
export const EVAL_CATALOG = {
  cities: ["Beograd", "Novi Sad", "Bor", "Niš", "Kragujevac"],
  services: ["šišanje", "feniranje", "masaža", "maderoterapija", "nokti", "šminkanje"],
  salons: [
    { name: "Kiki Kiss Beauty", city: "Beograd" },
    { name: "Shi Sham Frizerski Salon", city: "Novi Sad" },
    { name: "Beauty M Glow", city: "Bor" },
  ],
};

/** Maria ruter-kontrakt sistem prompt za eval — samostalan, mirror produkcije.
 * Identičan za sve provajdere (fer poređenje "prati JSON contract"). */
export function buildEvalSystemPrompt(): string {
  const cities = EVAL_CATALOG.cities.join(", ");
  const services = EVAL_CATALOG.services.join(", ");
  const salons = EVAL_CATALOG.salons
    .map((s) => `${s.name} (${s.city})`)
    .join(", ");
  return `
Ti si Maria, ruter za Marysoll booking platformu. Obraćaj se sa Vi, toplo i kratko.

# DOSTUPNI PODACI (jedina istina — ne izmišljaj van ovoga)
Gradovi sa salonima: ${cities}
Usluge: ${services}
Saloni: ${salons}

# ZADATAK
Za svaku poruku vrati ISKLJUČIVO validan JSON (bez teksta van JSON-a):
{
  "kind": "faq_answer" | "intent" | "clarification",
  "message": "kratka rečenica korisniku",
  "intent": {
    "domain": "faq" | "booking" | "appointments" | "prices" | "auth" | "cancel",
    "action": "answer_question" | "search_slots" | "view_appointments" | "show_prices" | "cancel_appointment" | "clarify" | "none",
    "entities": { "city": null, "service": null }
  },
  "routing": { "shouldHandoff": false, "targetAgent": "maria" | "claudia" | "auth" }
}

# PRAVILA
- Booking/termin/slobodno + (grad ili usluga) → domain "booking", action "search_slots", shouldHandoff true, targetAgent "claudia".
- Cenovnik/cene → domain "prices", action "show_prices".
- "moji termini"/zakazano → domain "appointments", action "view_appointments", shouldHandoff true.
- Otkazivanje termina → domain "cancel", action "cancel_appointment", shouldHandoff true.
- Pozdrav/hvala/doviđenja/B2B/promocije → domain "faq", shouldHandoff false, targetAgent "maria".
- Popuni entities.city/service SAMO ako su EKSPLICITNO pomenuti i POSTOJE u podacima gore.
- Ako grad ili usluga NE postoje u podacima → NE radi handoff (shouldHandoff false); ponudi najbliže/alternativu.
- Drži kontekst iz prethodnih poruka (grad/usluga pomenuti ranije i dalje važe).
`.trim();
}

export const GOLDEN_CASES: GoldenCase[] = [
  // ── Booking intent ────────────────────────────────────────────────────────
  {
    id: "booking-city-service",
    message: "Hoću masažu u Beogradu sutra",
    expect: {
      domain: "booking",
      action: "search_slots",
      shouldHandoff: true,
      city: "Beograd",
      service: "masaža",
    },
  },
  {
    id: "booking-no-diacritics",
    message: "moze sisanje u novom sadu u petak",
    expect: {
      domain: "booking",
      shouldHandoff: true,
      city: "Novi Sad",
      service: "šišanje",
    },
    note: "bez dijakritika + lokativ grada",
  },
  {
    id: "booking-case-bor",
    message: "Ima li slobodno za maderoterapiju u Boru?",
    expect: {
      domain: "booking",
      shouldHandoff: true,
      city: "Bor",
      service: "maderoterapija",
    },
  },
  {
    id: "booking-service-only",
    message: "Treba mi feniranje",
    expect: { domain: "booking", service: "feniranje" },
    note: "usluga bez grada — booking domen, grad fali",
  },
  // ── Multi-turn context ──────────────────────────────────────────────────────
  {
    id: "context-followup-city",
    message: "može li popodne",
    context: [
      { role: "user", content: "hoću nokte u Nišu" },
      {
        role: "assistant",
        content:
          '{"kind":"intent","message":"Proveravam termine za nokte u Nišu.","intent":{"domain":"booking","action":"search_slots","entities":{"city":"Niš","service":"nokti"}},"routing":{"shouldHandoff":true,"targetAgent":"claudia"}}',
      },
    ],
    expect: {
      domain: "booking",
      shouldHandoff: true,
      city: "Niš",
      service: "nokti",
    },
    note: "kontekst: grad/usluga iz prethodne poruke i dalje važe",
  },
  // ── Correction ("nisam to želeo") ──────────────────────────────────────────
  {
    id: "correction-city",
    message: "ne u Beogradu nego u Novom Sadu",
    context: [
      { role: "user", content: "šminkanje u Beogradu" },
      {
        role: "assistant",
        content:
          '{"kind":"intent","message":"Proveravam šminkanje u Beogradu.","intent":{"domain":"booking","action":"search_slots","entities":{"city":"Beograd","service":"šminkanje"}},"routing":{"shouldHandoff":true,"targetAgent":"claudia"}}',
      },
    ],
    expect: {
      domain: "booking",
      shouldHandoff: true,
      city: "Novi Sad",
      service: "šminkanje",
    },
    note: "korekcija grada uz zadržanu uslugu",
  },
  // ── Prices ───────────────────────────────────────────────────────────────
  {
    id: "prices-service",
    message: "Koliko košta feniranje?",
    expect: { domain: "prices", action: "show_prices", service: "feniranje" },
  },
  {
    id: "prices-cenovnik",
    message: "Da li mogu da vidim cenovnik?",
    expect: { domain: "prices", action: "show_prices" },
  },
  // ── Appointments ────────────────────────────────────────────────────────
  {
    id: "appointments-view",
    message: "moji termini",
    expect: {
      domain: "appointments",
      action: "view_appointments",
      shouldHandoff: true,
    },
  },
  {
    id: "appointments-status",
    message: "da li je moj termin odobren?",
    expect: { domain: "appointments", shouldHandoff: true },
  },
  // ── Cancel ───────────────────────────────────────────────────────────────
  {
    id: "cancel-appointment",
    message: "otkaži moj termin",
    expect: {
      domain: "cancel",
      action: "cancel_appointment",
      shouldHandoff: true,
    },
  },
  // ── FAQ / closure / B2B (Maria-owned, no handoff) ─────────────────────────
  {
    id: "faq-greeting",
    message: "Zdravo",
    expect: { domain: "faq", shouldHandoff: false },
  },
  {
    id: "faq-thanks",
    message: "hvala puno",
    expect: { domain: "faq", shouldHandoff: false },
  },
  {
    id: "faq-registration",
    message: "Da li moram da se registrujem da zakažem?",
    expect: { domain: "faq", action: "answer_question", shouldHandoff: false },
  },
  {
    id: "b2b-owner",
    message: "Vlasnik sam salona, kako da uđem u Marysoll?",
    expect: { domain: "faq", shouldHandoff: false },
    note: "B2B ostaje na Mariji",
  },
  {
    id: "promo",
    message: "Imate li neke akcije ili popuste?",
    expect: { domain: "faq", shouldHandoff: false },
  },
  // ── Hallucination guards (nonexistent city/service) ──────────────────────
  {
    id: "hallucination-city",
    message: "Hoću masažu u Subotici sutra",
    expect: { mustNotInvent: true, shouldHandoff: false },
    note: "Subotica nije u katalogu — ne sme handoff kao da postoji",
  },
  {
    id: "hallucination-city-leskovac",
    message: "feniranje u Leskovcu",
    expect: { mustNotInvent: true, shouldHandoff: false },
    note: "Leskovac nije u katalogu",
  },
  {
    id: "hallucination-service",
    message: "Hoću tetovažu u Beogradu",
    expect: { mustNotInvent: true, shouldHandoff: false },
    note: "tetovaža nije usluga platforme",
  },
  // ── Ambiguous ───────────────────────────────────────────────────────────
  {
    id: "ambiguous-help",
    message: "treba mi nešto",
    expect: { domain: "faq", shouldHandoff: false },
    note: "nejasno — clarify/faq, ne booking",
  },
];

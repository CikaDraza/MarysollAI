// src/lib/ai/slicePlatformKnowledge.usage.md
//
// Kako koristiti slicePlatformKnowledge u askAgent.ts
// =====================================================
//
// Postoje dva mesta u askAgent.ts gde se buildClaudiaSystemPrompt zove.
// Oba treba da dobiju slice umesto punog platform knowledge.
//
// -------------------------------------------------------
// MESTO 1 — LLM path (direktni Claudia poziv bez handoffa)
// -------------------------------------------------------
//
// BEFORE (u askAgent.ts, ~linija 1700+):
//
//   const platform = await fetchPlatformKnowledge();
//   const systemPrompt = buildClaudiaSystemPrompt(
//     platform.salonsText,
//     platform.servicesText,
//     platform.citiesText,
//     platform.categoriesText,
//     isAuthenticated,
//     userName,
//     memoryContext,
//   );
//
// AFTER:
//
//   const platform = await fetchPlatformKnowledge();
//   const slice = sliceFromCollected(platform, mergedBookingContext, {
//     queryType: handoffPayload?.intent as SliceContext["queryType"] ?? "booking",
//     nearestCityCandidates: Array.isArray(handoffPayload?.nearestCityCandidates)
//       ? handoffPayload.nearestCityCandidates as string[]
//       : undefined,
//   });
//   const systemPrompt = buildClaudiaSystemPrompt(
//     slice.salonsText,     // ← slice umesto platform.salonsText
//     slice.servicesText,   // ← slice umesto platform.servicesText
//     slice.citiesText,
//     slice.categoriesText,
//     isAuthenticated,
//     userName,
//     memoryContext,
//   );
//
// -------------------------------------------------------
// MESTO 2 — directPlatform object (direktni intent path)
// -------------------------------------------------------
//
// BEFORE (~linija 1365):
//
//   const directPlatform = {
//     salonsText: "",
//     servicesText: "",
//     citiesText: [...new Set(salons.map(s => s.city)...)].join(", "),
//     categoriesText: "",
//     raw: { salons, services, categories: [] },
//     semanticMemory: undefined,
//   };
//
// AFTER:
//   Ostavi raw za resolveSalonsForService i resolveCityServiceAvailability
//   koji rade sopstveno filtriranje. directPlatform.raw mora ostati nepromenjen.
//   slice koristi samo za buildClaudiaSystemPrompt, ne za direktne resolve pozive.
//
// -------------------------------------------------------
// IMPORT
// -------------------------------------------------------
//
// import {
//   sliceFromCollected,
//   type SliceContext,
// } from "@/lib/ai/slicePlatformKnowledge";
//
// -------------------------------------------------------
// EFEKAT
// -------------------------------------------------------
//
// Pre:  ~2000 tokena platform knowledge svaki poziv
// Posle:
//   - city=Beograd, service=feniranje  →  ~200 tokena
//   - city=Novi Sad, bez service       →  ~400 tokena
//   - bez konteksta (prvi poziv)       →  ~600 tokena (cap 8 salona, 20 usluga)
//
// Latencija: 0ms (sync filter, nema I/O)
// Breaking changes: nema

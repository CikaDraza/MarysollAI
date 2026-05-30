// src/lib/ai/context/askAgent.patch.md
//
// PATCH za src/services/askAgent.ts — Task 3 Context Continuity
//
// Tri mesta se menjaju. Ništa drugo se ne dira.
// Svaki blok je označen kao FIND → REPLACE.
//
// ============================================================
// PATCH 1 — Import
// Dodaj import na vrh fajla, posle postojećih importa
// ============================================================
//
// DODAJ posle poslednjeg import reda:
//
// import {
//   mergeClaudiaContext,
//   inferCityFromSalon,
//   resolveNearestCandidatesForCity,
//   sanitizeClaudiaMessage,
//   type ClaudiaQueryContext,
// } from "@/lib/ai/context/claudiaContextContinuity";
//
// ============================================================
// PATCH 2 — prices path: sačuvaj kontekst + sanitizuj poruku
// ============================================================
//
// FIND (ceo if blok direct.type === "prices"):
//   if (direct.type === "prices") {
//     const city = direct.entities.city ?? collectedBookingFields?.city;
//     const service = direct.entities.service ?? collectedBookingFields?.service ?? collectedBookingFields?.category;
//     const salonName = direct.entities.salonName ?? collectedBookingFields?.salonName;
//
// REPLACE SA:
//   if (direct.type === "prices") {
//     const city = direct.entities.city ?? collectedBookingFields?.city;
//     const service = direct.entities.service ?? collectedBookingFields?.service ?? collectedBookingFields?.category;
//     const salonName = direct.entities.salonName ?? collectedBookingFields?.salonName;
//
//     // Task 3 — persist prices context so follow-ups keep service/city
//     bookingFlow.get().collect({
//       ...(city ? { city } : {}),
//       ...(service ? { service } : {}),
//       ...(salonName ? { salonName } : {}),
//     });
//
// Zatim FIND (kraj prices path — posle entities: {...}):
//   status: priceSalons.length > 1 && !matchedSalon ? "waiting_for_user" : "ready",
//   reason: "direct_prices",
//
// REPLACE SA:
//   status: priceSalons.length > 1 && !matchedSalon ? "waiting_for_user" : "ready",
//   reason: "direct_prices",
// -- kraj bloka
//
// ============================================================
// PATCH 3 — salon_info path: sačuvaj nearestCityCandidates + sanitizuj
// ============================================================
//
// FIND (u salon_info bloku, pre return streamClaudiaContract):
//   const message = availability.hasSalonInCity
//     ? `Da, imamo salon u ${direct.entities.city}: ...`
//     : direct.entities.city
//       ? alternatives.length > 0
//         ? `Trenutno nemamo salon u ${inCity(direct.entities.city)}. Najbliže opcije su ${alternatives.join(" i ")}. Koja usluga vas zanima?`
//         : formatNearestSalonAnswer({ requestedCity: direct.entities.city })
//       : "Za koji grad da proverim salone?";
//
// REPLACE SA:
//   const rawMessage = availability.hasSalonInCity
//     ? `Da, imamo salon u ${direct.entities.city}: ${availability.matchingSalons.map((s) => s.name).filter(Boolean).join(", ")}.`
//     : direct.entities.city
//       ? alternatives.length > 0
//         ? `Trenutno nemamo salon u ${inCity(direct.entities.city)}. Najbliže opcije su ${alternatives.join(" i ")}. Koja usluga vas zanima?`
//         : formatNearestSalonAnswer({ requestedCity: direct.entities.city })
//       : "Za koji grad da proverim salone?";
//   const message = sanitizeClaudiaMessage(rawMessage);
//
//   // Task 3 — persist city availability context
//   if (direct.entities.city && !availability.hasSalonInCity && alternatives.length > 0) {
//     bookingFlow.get().collect({
//       ...(direct.entities.service ? { service: direct.entities.service } : {}),
//       ...(direct.entities.category ? { category: direct.entities.category } : {}),
//     });
//     // Store nearestCityCandidates in entities for follow-up resolution
//   }
//
// FIND (salon_info entities):
//   entities: direct.entities,
//
// REPLACE SA:
//   entities: {
//     ...direct.entities,
//     nearestCityCandidates: availability.hasSalonInCity ? undefined : alternatives,
//     requestedCity: direct.entities.city,
//   },
//
// ============================================================
// PATCH 4 — follow_up / booking path: city inference from salon
// ============================================================
//
// FIND:
//   if (direct.type === "follow_up" || direct.type === "booking") {
//     const directSalon = direct.entities.salonName
//       ? salons.find((salon) => normalizeSemanticTerm(salon.name ?? "").includes(normalizeSemanticTerm(direct.entities.salonName ?? "")))
//       : undefined;
//     const bookingPayload = {
//       intent: "booking",
//       city: direct.entities.city ?? directSalon?.city ?? collectedBookingFields?.city,
//
// REPLACE SA:
//   if (direct.type === "follow_up" || direct.type === "booking") {
//     const directSalon = direct.entities.salonName
//       ? salons.find((salon) => normalizeSemanticTerm(salon.name ?? "").includes(normalizeSemanticTerm(direct.entities.salonName ?? "")))
//       : undefined;
//     // Task 3 — infer city from salon if city not explicitly stated
//     const inferredCity =
//       direct.entities.city ??
//       directSalon?.city ??
//       inferCityFromSalon(direct.entities.salonName, undefined, salons) ??
//       collectedBookingFields?.city;
//     const bookingPayload = {
//       intent: "booking",
//       city: inferredCity,
//
// ============================================================
// PATCH 5 — makeClaudiaContract wrapper: sanitize all messages
// ============================================================
//
// FIND (u makeClaudiaContract, posle sanitizeVisibleAgentMessage poziva):
//   const message = sanitizeVisibleAgentMessage(
//     truth.correctedMessage ?? input.message,
//     "claudia",
//   );
//
// REPLACE SA:
//   const rawMsg = truth.correctedMessage ?? input.message;
//   const message = sanitizeClaudiaMessage(
//     sanitizeVisibleAgentMessage(rawMsg, "claudia"),
//   );
//
// ============================================================
// END PATCH
// ============================================================

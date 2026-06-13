// src/lib/ai/claudia-activity.ts
//
// Faza 7 — signal aktivnosti za timeout svestan statusa.
// Klijentski stream loop poziva markClaudiaActivity() na svaki primljeni
// okvir (status/final). Orkestrator umesto tvrdog "završi za 18s" koristi
// "nema aktivnosti 18s" — pa status event ("proveravamo…") resetuje budžet i
// ne okida lažni fallback dok Claudia očigledno radi.

let lastActivityAt = 0;

/** Poziva se kad od Claudie stigne bilo kakav stream okvir. */
export function markClaudiaActivity(): void {
  lastActivityAt = Date.now();
}

export function getLastClaudiaActivityAt(): number {
  return lastActivityAt;
}

/** Resetuje merač na "sada" — orkestrator ga zove na početku handoff-a da
 * prvi interval meri od trenutka kada je provera krenula. */
export function resetClaudiaActivity(): void {
  lastActivityAt = Date.now();
}

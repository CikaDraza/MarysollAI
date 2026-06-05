// Small Serbian text helpers shared by SEO content + FAQ + JSON-LD.

/** Count word for salons: 1 salon, 2/5/12 salona. */
export function salonWord(n: number): string {
  return n % 10 === 1 && n % 100 !== 11 ? "salon" : "salona";
}

/** Count word for appointments: 1 termin, 2/5/12 termina. */
export function terminWord(n: number): string {
  return n % 10 === 1 && n % 100 !== 11 ? "termin" : "termina";
}

const isPaucal = (n: number) =>
  [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100);

/** "ocena" word: 1 ocena, 23 ocene, 5 ocena. */
export function oceneWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return "ocena";
  return isPaucal(n) ? "ocene" : "ocena";
}

/** "utisak" word: 1 utisak, 23 utiska, 5 utisaka. */
export function utisakWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return "utisak";
  return isPaucal(n) ? "utiska" : "utisaka";
}

/** "1500" → "1.500" (sr-RS grouping). */
export function formatRsd(price: number): string {
  return price.toLocaleString("sr-RS");
}

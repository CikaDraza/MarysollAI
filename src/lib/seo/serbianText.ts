// Small Serbian text helpers shared by SEO content + FAQ + JSON-LD.

/** Count word for salons: 1 salon, 2/5/12 salona. */
export function salonWord(n: number): string {
  return n % 10 === 1 && n % 100 !== 11 ? "salon" : "salona";
}

/** Count word for appointments: 1 termin, 2/5/12 termina. */
export function terminWord(n: number): string {
  return n % 10 === 1 && n % 100 !== 11 ? "termin" : "termina";
}

/** "1500" → "1.500" (sr-RS grouping). */
export function formatRsd(price: number): string {
  return price.toLocaleString("sr-RS");
}

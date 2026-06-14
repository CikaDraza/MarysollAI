// src/lib/ai/claudia/spellingHint.ts
//
// Tiny, high-confidence spelling touch: when the user mistypes a very common
// Serbian phrase, Claudia briefly notes the correct form and continues. ONE
// hint per turn, conservative curated list — never preachy, never guesses.

const HINTS: Array<[RegExp, string]> = [
  [/\buredu\b/i, "u redu"],
  [/\bnemogu\b/i, "ne mogu"],
  [/\bneznam\b/i, "ne znam"],
  [/\bnebih\b/i, "ne bih"],
  [/\bnemoze\b/i, "ne može"],
  [/\bnemože\b/i, "ne može"],
];

/** Returns a short prefix like `Piše se „u redu". ` for the first match, else null. */
export function spellingHint(userMessage: string): string | null {
  const text = typeof userMessage === "string" ? userMessage : "";
  for (const [re, correct] of HINTS) {
    if (re.test(text)) return `Piše se „${correct}". `;
  }
  return null;
}

const ACTION_KEYWORDS = [
  "zakazi",
  "registr",
  "prijav",
  "termin",
  "cena",
  "usluga",
  "newsletter",
];

export function requiresLayout(prompt: string) {
  const p = prompt.toLowerCase();
  return ACTION_KEYWORDS.some((k) => p.includes(k));
}

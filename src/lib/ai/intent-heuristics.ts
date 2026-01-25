const ACTION_KEYWORDS = [
  "zakazi",
  "registruj me",
  "prijavi me",
  "termin",
  "cena",
  "usluga",
  "newsletter",
];

export function requiresLayout(prompt: string) {
  const p = prompt.toLowerCase();
  return ACTION_KEYWORDS.some((k) => p.includes(k));
}

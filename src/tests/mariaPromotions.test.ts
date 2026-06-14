// Maria promotions — formatter must never fabricate; honest empty state.
import {
  formatPromotionsForPrompt,
  type MariaPromotion,
} from "@/lib/ai/communication/maria-promotions";

describe("formatPromotionsForPrompt", () => {
  it("empty list → honest 'no promotions' line (no fabrication)", () => {
    const out = formatPromotionsForPrompt([]);
    expect(out).toContain("AKTUELNE PROMOCIJE");
    expect(out).toContain("Trenutno nema aktivnih promocija");
    expect(out).not.toMatch(/\d+%|popust/i); // never invents a discount
  });

  it("tenant promo shows salon + link; platform promo omits the salon dash", () => {
    const promos: MariaPromotion[] = [
      {
        title: "Letnja akcija",
        source: "Kiki Kiss Beauty",
        href: "https://kiki.example/blog/x",
        isTenant: true,
      },
      {
        title: "Marysoll vodič",
        source: "Marysoll",
        href: "https://marysoll.com/newsletter/y",
        isTenant: false,
      },
    ];
    const out = formatPromotionsForPrompt(promos);
    expect(out).toContain('"Letnja akcija" — Kiki Kiss Beauty');
    expect(out).toContain("https://kiki.example/blog/x");
    expect(out).toContain('"Marysoll vodič"');
    expect(out).not.toContain("Marysoll vodič — Marysoll");
  });

  it("caps the list at 6 entries", () => {
    const many: MariaPromotion[] = Array.from({ length: 10 }, (_, i) => ({
      title: `P${i}`,
      source: "S",
      href: `https://h${i}`,
      isTenant: true,
    }));
    const out = formatPromotionsForPrompt(many);
    expect((out.match(/^- /gm) ?? []).length).toBe(6);
  });
});

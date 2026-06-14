// Deterministic affirmative routing + spelling touch.
import { parseClaudiaDirectIntent } from "@/services/askAgent";
import { spellingHint } from "@/lib/ai/claudia/spellingHint";

describe("bare affirmative → follow_up (with context)", () => {
  const ctx = { service: "feniranje", city: "Beograd" };

  it("'da' with context proceeds (follow_up), not unknown", () => {
    expect(
      parseClaudiaDirectIntent({ text: "da", collectedBookingFields: ctx }).type,
    ).toBe("follow_up");
  });

  it("'naravno' and 'u redu' with context → follow_up", () => {
    expect(
      parseClaudiaDirectIntent({ text: "naravno", collectedBookingFields: ctx })
        .type,
    ).toBe("follow_up");
    expect(
      parseClaudiaDirectIntent({ text: "U redu", collectedBookingFields: ctx })
        .type,
    ).toBe("follow_up");
  });

  it("bare 'da' WITHOUT context stays unknown (warm clarification, no false proceed)", () => {
    expect(parseClaudiaDirectIntent({ text: "da" }).type).toBe("unknown");
  });

  it("a real sentence still classifies normally (not swallowed by affirmative)", () => {
    expect(
      parseClaudiaDirectIntent({
        text: "da li imate salon u Rumi",
        collectedBookingFields: {},
      }).type,
    ).toBe("salon_info");
  });
});

describe("spellingHint", () => {
  it("flags common mistypes with a short prefix", () => {
    expect(spellingHint("uredu")).toBe('Piše se „u redu". ');
    expect(spellingHint("nemogu sutra")).toBe('Piše se „ne mogu". ');
    expect(spellingHint("neznam")).toBe('Piše se „ne znam". ');
  });

  it("leaves correct/normal text alone", () => {
    expect(spellingHint("u redu")).toBeNull();
    expect(spellingHint("feniranje u Beogradu")).toBeNull();
    expect(spellingHint("")).toBeNull();
  });
});

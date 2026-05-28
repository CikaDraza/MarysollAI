import { detectCityAvailabilityQuestion } from "@/lib/ai/detectCityAvailabilityQuestion";
import { extractBookingIntentFromConversation } from "@/lib/ai/extractBookingIntentFromConversation";

describe("salon existence intent helpers", () => {
  it("detects Loznica in locative form", () => {
    const result = detectCityAvailabilityQuestion(
      "Pozdrav, interesuje me da li ima salon za masazu u Loznici?",
    );

    expect(result.detected).toBe(true);
    expect(result.city).toBe("Loznica");
  });

  it("extracts massage and Loznica from salon info question", () => {
    const intent = extractBookingIntentFromConversation({
      messages: [
        {
          role: "user",
          content: "Pozdrav, interesuje me da li ima salon za masazu u Loznici?",
        },
      ],
    });

    expect(intent.service).toBe("masaža");
    expect(intent.city).toBe("Loznica");
  });

  it("preserves previous massage context when user follows up with only city", () => {
    const intent = extractBookingIntentFromConversation({
      messages: [
        {
          role: "user",
          content: "Pozdrav, interesuje me da li ima salon za masazu?",
        },
        {
          role: "assistant",
          content: "Mogu da proverim, samo mi napišite grad koji vas zanima.",
        },
        { role: "user", content: "Loznica" },
      ],
    });

    expect(intent.service).toBe("masaža");
    expect(intent.city).toBe("Loznica");
  });

  it("extracts massage and Beograd from service availability question", () => {
    const intent = extractBookingIntentFromConversation({
      messages: [
        {
          role: "user",
          content: "Da li ima masaza tretman u Beogradu?",
        },
      ],
    });

    expect(intent.service).toBe("masaža");
    expect(intent.city).toBe("Beograd");
  });

  it("extracts massage from service city list question without requiring city", () => {
    const intent = extractBookingIntentFromConversation({
      messages: [
        {
          role: "user",
          content: "Dajte mi gradove u kojima imate masazu?",
        },
      ],
    });

    expect(intent.service).toBe("masaža");
    expect(intent.city).toBeUndefined();
  });
});

// src/tests/layout.test.ts
import { LayoutSuggestionSchema } from "../types/ai/layout-ai.schema";

describe("Layout AI Response Validation", () => {
  it("should validate a correct layout suggestion from Gemini", () => {
    const mockGeminiResponse = {
      type: "layout_suggestion",
      intent: "Korisnik želi da vidi cene i zakže termin",
      blocks: [
        { type: "ServicePriceBlock", priority: 1 },
        { type: "TestimonialBlock", priority: 2 },
      ],
    };

    const result = LayoutSuggestionSchema.safeParse(mockGeminiResponse);

    if (!result.success) {
      console.error("Zod Error:", result.error.format());
    }

    expect(result.success).toBe(true);
  });

  it("should fail validation if block type is wrong", () => {
    const mockGeminiResponse = {
      type: "layout_suggestion",
      blocks: [{ type: "NonExistentBlock", priority: 1 }],
    };
    const result = LayoutSuggestionSchema.safeParse(mockGeminiResponse);
    expect(result.success).toBe(false);
  });
});

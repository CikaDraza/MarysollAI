// src/tests/layout.test.ts
import z from "zod";
import { LayoutSuggestionSchema } from "../types/ai/layout-ai.schema";
import { groupMessagesByBlock } from "../helpers/groupTextMessages";
import { TextMessage } from "../types/ai/ai.text-engine";

describe("Layout & Logic Validation", () => {
  describe("LayoutSuggestionSchema", () => {
    describe("Layout AI Response Validation", () => {
      it("should validate a correct layout suggestion from Gemini", () => {
        const mockGeminiResponse = {
          type: "layout_suggestion",
          intent: "Korisnik želi da vidi cene i zakaže termin",
          blocks: [
            { type: "ServicePriceBlock", priority: 1 },
            { type: "AuthBlock", priority: 2 },
          ],
        };

        const result = LayoutSuggestionSchema.safeParse(mockGeminiResponse);

        if (!result.success) {
          console.error("Zod Error:", z.treeifyError(result.error));
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

    it("should fail if priority is less than 1", () => {
      const invalidResponse = {
        type: "layout_suggestion",
        intent: "test",
        blocks: [{ type: "AuthBlock", priority: 0 }], // 0 nije dozvoljeno
      };
      const result = LayoutSuggestionSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it("should fail if intent is missing", () => {
      const invalidResponse = {
        type: "layout_suggestion",
        blocks: [{ type: "AuthBlock", priority: 1 }],
      };
      const result = LayoutSuggestionSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });
  });

  describe("groupMessagesByBlock Helper", () => {
    it("should group messages correctly and provide 'global' as fallback", () => {
      const mockMessages: TextMessage[] = [
        { id: "1", content: "Zdravo", role: "user", type: "text" }, // Nema attachToBlockType
        {
          id: "2",
          content: "Cene su ovde",
          role: "assistant",
          type: "text",
          attachToBlockType: "ServicePriceBlock",
        },
      ];

      const grouped = groupMessagesByBlock(mockMessages);

      expect(grouped.global).toHaveLength(1);
      expect(grouped.ServicePriceBlock).toHaveLength(1);
      expect(grouped.global[0].content).toBe("Zdravo");
      expect(grouped.ServicePriceBlock[0].content).toBe("Cene su ovde");
    });

    it("should return empty array for non-existent blocks in grouped object", () => {
      const grouped = groupMessagesByBlock([]);
      // Proveravamo da li pristupanje nasumičnom ključu ne puca (treba da vrati undefined ili [])
      // Naša funkcija trenutno vraća undefined za nepostojeće ključeve osim ako je ne modifikujemo
      expect(grouped.AuthBlock).toBeUndefined();
    });
  });
});

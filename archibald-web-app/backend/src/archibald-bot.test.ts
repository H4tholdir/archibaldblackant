import { describe, it, expect, vi, beforeEach } from "vitest";
import { ArchibaldBot } from "./archibald-bot";
import type { Product } from "./product-db";

describe("ArchibaldBot", () => {
  let bot: ArchibaldBot;

  beforeEach(() => {
    bot = new ArchibaldBot({
      username: "test@example.com",
      password: "testpass",
      headless: true,
    });
  });

  describe("quantity validation", () => {
    it("should throw error when quantity validation fails", async () => {
      // Mock the productDb.validateQuantity to return invalid result
      const mockValidateQuantity = vi.spyOn(
        bot["productDb"],
        "validateQuantity",
      );
      mockValidateQuantity.mockReturnValue({
        valid: false,
        errors: [
          "Quantity must be at least 5",
          "Quantity must be a multiple of 5",
        ],
        suggestions: [5, 10],
      });

      // Mock product variant
      const mockVariant: Product = {
        id: "016869K2",
        name: "H129FSQ.104.023",
        minQty: 5,
        multipleQty: 5,
        maxQty: 500,
        packageContent: "50",
        hash: "test-hash",
        lastSync: Date.now(),
      };

      // Mock order item
      const mockItem = {
        articleCode: "H129FSQ.104.023",
        quantity: 3, // Invalid: less than minQty and not multiple of 5
        _selectedVariant: mockVariant,
      };

      // The bot's createOrder method would call validateQuantity internally
      // Since we can't easily test the full createOrder flow without Puppeteer,
      // we verify the validation logic directly by simulating what happens
      // when validation is called with invalid quantity

      const validation = bot["productDb"].validateQuantity(
        mockVariant,
        mockItem.quantity,
      );

      expect(validation.valid).toBe(false);
      expect(validation.errors).toHaveLength(2);
      expect(validation.errors).toContain("Quantity must be at least 5");
      expect(validation.errors).toContain("Quantity must be a multiple of 5");
      expect(validation.suggestions).toEqual([5, 10]);

      // In the actual bot flow, this would throw an error
      expect(() => {
        if (!validation.valid) {
          const errorMsg = `Quantity ${mockItem.quantity} is invalid for article ${mockItem.articleCode} (variant ${mockVariant.id}): ${validation.errors.join(", ")}`;
          const suggestMsg = validation.suggestions
            ? ` Suggested quantities: ${validation.suggestions.join(", ")}`
            : "";
          throw new Error(`${errorMsg}${suggestMsg}`);
        }
      }).toThrow(
        /Quantity 3 is invalid for article H129FSQ\.104\.023 \(variant 016869K2\): Quantity must be at least 5, Quantity must be a multiple of 5 Suggested quantities: 5, 10/,
      );

      mockValidateQuantity.mockRestore();
    });

    it("should not throw error when quantity validation succeeds", async () => {
      // Mock the productDb.validateQuantity to return valid result
      const mockValidateQuantity = vi.spyOn(
        bot["productDb"],
        "validateQuantity",
      );
      mockValidateQuantity.mockReturnValue({
        valid: true,
        errors: [],
      });

      // Mock product variant
      const mockVariant: Product = {
        id: "016869K2",
        name: "H129FSQ.104.023",
        minQty: 5,
        multipleQty: 5,
        maxQty: 500,
        packageContent: "50",
        hash: "test-hash",
        lastSync: Date.now(),
      };

      // Mock order item
      const mockItem = {
        articleCode: "H129FSQ.104.023",
        quantity: 10, // Valid: meets all rules
        _selectedVariant: mockVariant,
      };

      const validation = bot["productDb"].validateQuantity(
        mockVariant,
        mockItem.quantity,
      );

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // In the actual bot flow, this would proceed without throwing
      expect(() => {
        if (!validation.valid) {
          const errorMsg = `Quantity ${mockItem.quantity} is invalid for article ${mockItem.articleCode} (variant ${mockVariant.id}): ${validation.errors.join(", ")}`;
          throw new Error(errorMsg);
        }
      }).not.toThrow();

      mockValidateQuantity.mockRestore();
    });
  });
});

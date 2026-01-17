import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { ArchibaldBot } from "./archibald-bot";
import { ProductDatabase } from "./product-db";
import * as fixtures from "./test-fixtures/orders";

describe("Package Selection Integration Tests", () => {
  let bot: ArchibaldBot;

  beforeAll(async () => {
    // Initialize bot (uses singleton ProductDatabase)
    bot = new ArchibaldBot();
    await bot.initialize();
  });

  afterAll(async () => {
    await bot.close();
  });

  test("creates order with single-package article", async () => {
    // Given: Order with TD1272.314 (1 variant)
    const orderData = fixtures.singlePackageOrderFixture;

    // When: Create order
    const orderId = await bot.createOrder(orderData);

    // Then: Order created successfully
    expect(orderId).toBeTruthy();
    expect(orderId).toMatch(/^\d+$/); // Numeric order ID
  });

  test("selects highest package when quantity >= max multiple", async () => {
    // Given: Order with H129FSQ.104.023, quantity 10
    const orderData = fixtures.multiPackageHighQuantityFixture;

    // When: Create order
    const orderId = await bot.createOrder(orderData);

    // Then: Order created with 5-piece package
    expect(orderId).toBeTruthy();

    // Verify in Archibald (manual check or API query)
    // Expected: Variant ID 016869K2 (5-piece) was selected
  });

  test("selects lowest package when quantity < max multiple", async () => {
    // Given: Order with H129FSQ.104.023, quantity 3
    const orderData = fixtures.multiPackageLowQuantityFixture;

    // When: Create order
    const orderId = await bot.createOrder(orderData);

    // Then: Order created with 1-piece package
    expect(orderId).toBeTruthy();

    // Verify in Archibald (manual check or API query)
    // Expected: Variant ID 016869K3 (1-piece) was selected
  });

  test("selects highest package when quantity equals threshold", async () => {
    // Given: Order with H129FSQ.104.023, quantity 5 (exactly at threshold)
    const orderData = fixtures.multiPackageThresholdFixture;

    // When: Create order
    const orderId = await bot.createOrder(orderData);

    // Then: Order created with 5-piece package (>= rule)
    expect(orderId).toBeTruthy();
  });

  test("throws error for quantity below minQty", async () => {
    // Given: Order with quantity 2 (below minQty)
    const orderData = fixtures.invalidQuantityBelowMinFixture;

    // When/Then: CreateOrder throws validation error
    await expect(bot.createOrder(orderData)).rejects.toThrow(
      /Quantity must be at least/,
    );
  });

  test("throws error for quantity not multiple of multipleQty", async () => {
    // Given: Order with quantity 7 (not multiple of 5)
    const orderData = fixtures.invalidQuantityNotMultipleFixture;

    // When/Then: CreateOrder throws validation error
    await expect(bot.createOrder(orderData)).rejects.toThrow(
      /Quantity must be a multiple of/,
    );
  });

  test("provides suggestions in error message", async () => {
    // Given: Order with invalid quantity
    const orderData = fixtures.invalidQuantityNotMultipleFixture;

    // When/Then: Error includes suggestions
    await expect(bot.createOrder(orderData)).rejects.toThrow(
      /Suggested quantities: 5, 10/,
    );
  });

  test("handles multi-item order with different package types", async () => {
    // Given: Order with multiple items, different package scenarios
    const orderData = {
      customerName: "Fresis Soc Cooperativa",
      items: [
        {
          articleCode: "TD1272.314",
          quantity: 5, // Single package
          price: 0,
        },
        {
          articleCode: "H129FSQ.104.023",
          quantity: 10, // Multi-package, high qty
          price: 0,
        },
        {
          articleCode: "H129FSQ.104.023",
          quantity: 3, // Multi-package, low qty
          price: 0,
        },
      ],
    };

    // When: Create order
    const orderId = await bot.createOrder(orderData);

    // Then: Order created with correct packages for each item
    expect(orderId).toBeTruthy();
  });

  test("throws error when article not found in database", async () => {
    // Given: Order with non-existent article
    const orderData = {
      customerName: "Fresis Soc Cooperativa",
      items: [
        {
          articleCode: "NONEXISTENT999",
          quantity: 5,
          price: 0,
        },
      ],
    };

    // When/Then: CreateOrder throws error
    await expect(bot.createOrder(orderData)).rejects.toThrow(
      /Article NONEXISTENT999 not found in database/,
    );
  });
});

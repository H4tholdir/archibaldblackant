import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { ArchibaldBot } from "./archibald-bot";
import { ProductDatabase } from "./product-db";
import type { OrderData } from "./types";

/**
 * Integration tests for package selection in createOrder
 *
 * These tests require:
 * - Archibald connection
 * - Product database synced
 * - Test customer "Fresis Soc Cooperativa" exists
 *
 * Test data expectations:
 * - H129FSQ.104.023 has 2 variants (016869K2: 5-piece, 016869K3: 1-piece)
 * - TD1272.314 has 1 variant
 */

// Test constants
const MULTI_PACKAGE_ARTICLE = "H129FSQ.104.023";
const SINGLE_PACKAGE_ARTICLE = "TD1272.314";
const NONEXISTENT_ARTICLE = "NONEXISTENT999";

const HIGH_QUANTITY = 10; // >= 5 (should select 5-piece)
const THRESHOLD_QUANTITY = 5; // = 5 (should select 5-piece)
const LOW_QUANTITY = 3; // < 5 (should select 1-piece)
const MIN_QUANTITY = 1; // = 1 (should select 1-piece)

const TEST_CUSTOMER_NAME = "Fresis Soc Cooperativa";

describe("createOrder with package selection", () => {
  let bot: ArchibaldBot;
  let productDb: ProductDatabase;

  beforeAll(async () => {
    bot = new ArchibaldBot();
    productDb = ProductDatabase.getInstance();

    // Verify test data exists
    const multiPackageVariants = productDb.getProductVariants(
      MULTI_PACKAGE_ARTICLE,
    );
    const singlePackageVariants = productDb.getProductVariants(
      SINGLE_PACKAGE_ARTICLE,
    );

    if (multiPackageVariants.length !== 2) {
      throw new Error(
        `Test data missing: ${MULTI_PACKAGE_ARTICLE} should have 2 variants, found ${multiPackageVariants.length}`,
      );
    }

    if (singlePackageVariants.length !== 1) {
      throw new Error(
        `Test data missing: ${SINGLE_PACKAGE_ARTICLE} should have 1 variant, found ${singlePackageVariants.length}`,
      );
    }

    await bot.launch();
    await bot.login();
  }, 60000); // 60s timeout for launch + login

  afterAll(async () => {
    await bot.close();
  });

  describe("single package articles", () => {
    it("should select single package variant correctly", async () => {
      const orderData: OrderData = {
        customerId: "",
        customerName: TEST_CUSTOMER_NAME,
        items: [
          {
            articleCode: SINGLE_PACKAGE_ARTICLE,
            quantity: 5,
            description: "",
            price: 0,
          },
        ],
      };

      const orderId = await bot.createOrder(orderData);
      expect(orderId).toBeTruthy();
    }, 120000); // 2 min timeout
  });

  describe("multi-package articles - high quantity", () => {
    it("should select highest package when quantity >= max multiple", async () => {
      const orderData: OrderData = {
        customerId: "",
        customerName: TEST_CUSTOMER_NAME,
        items: [
          {
            articleCode: MULTI_PACKAGE_ARTICLE,
            quantity: HIGH_QUANTITY,
            description: "",
            price: 0,
          },
        ],
      };

      // Expected: Bot should search for variant ID 016869K2 (5-piece)
      const orderId = await bot.createOrder(orderData);
      expect(orderId).toBeTruthy();
    }, 120000);

    it("should select highest package when quantity equals threshold", async () => {
      const orderData: OrderData = {
        customerId: "",
        customerName: TEST_CUSTOMER_NAME,
        items: [
          {
            articleCode: MULTI_PACKAGE_ARTICLE,
            quantity: THRESHOLD_QUANTITY,
            description: "",
            price: 0,
          },
        ],
      };

      // Expected: Bot should select 5-piece (>= rule)
      const orderId = await bot.createOrder(orderData);
      expect(orderId).toBeTruthy();
    }, 120000);
  });

  describe("multi-package articles - low quantity", () => {
    it("should select lowest package when quantity < max multiple", async () => {
      const orderData: OrderData = {
        customerId: "",
        customerName: TEST_CUSTOMER_NAME,
        items: [
          {
            articleCode: MULTI_PACKAGE_ARTICLE,
            quantity: LOW_QUANTITY,
            description: "",
            price: 0,
          },
        ],
      };

      // Expected: Bot should search for variant ID 016869K3 (1-piece)
      const orderId = await bot.createOrder(orderData);
      expect(orderId).toBeTruthy();
    }, 120000);

    it("should select lowest package when quantity = 1", async () => {
      const orderData: OrderData = {
        customerId: "",
        customerName: TEST_CUSTOMER_NAME,
        items: [
          {
            articleCode: MULTI_PACKAGE_ARTICLE,
            quantity: MIN_QUANTITY,
            description: "",
            price: 0,
          },
        ],
      };

      // Expected: Bot should select 1-piece variant
      const orderId = await bot.createOrder(orderData);
      expect(orderId).toBeTruthy();
    }, 120000);
  });

  describe("error handling", () => {
    it("should throw error when article not found in database", async () => {
      const orderData: OrderData = {
        customerId: "",
        customerName: TEST_CUSTOMER_NAME,
        items: [
          {
            articleCode: NONEXISTENT_ARTICLE,
            quantity: 5,
            description: "",
            price: 0,
          },
        ],
      };

      await expect(bot.createOrder(orderData)).rejects.toThrow(
        `Article ${NONEXISTENT_ARTICLE} not found in database`,
      );
    }, 120000);
  });
});

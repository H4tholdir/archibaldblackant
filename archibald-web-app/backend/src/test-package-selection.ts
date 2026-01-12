/**
 * Manual test script for package selection feature
 *
 * This script creates a test order to verify package variant selection works correctly.
 *
 * Usage: npm run test:package-selection
 */

import { ArchibaldBot } from "./archibald-bot";
import { ProductDatabase } from "./product-db";
import { logger } from "./logger";
import type { OrderData } from "./types";

async function main() {
  const bot = new ArchibaldBot();
  const db = ProductDatabase.getInstance();

  try {
    logger.info("=== Package Selection Test Script ===");
    logger.info("");

    // Check available test articles
    logger.info("Checking database for multi-package articles...");

    // Find all articles with multiple variants
    const allProducts = db.getProducts();
    const articleGroups: Record<string, typeof allProducts> = {};
    allProducts.forEach((p) => {
      if (!articleGroups[p.name]) articleGroups[p.name] = [];
      articleGroups[p.name].push(p);
    });

    const multiVariants = Object.entries(articleGroups).filter(
      ([_, products]) => products.length > 1,
    );

    logger.info(
      `Found ${multiVariants.length} articles with multiple variants`,
    );

    if (multiVariants.length === 0) {
      logger.error("No multi-package articles found. Run product sync first.");
      process.exit(1);
    }

    // Use first multi-package article for testing
    const [testArticleName, variants] = multiVariants[0];
    logger.info(`Test article: ${testArticleName}`);
    logger.info(`Variants (${variants.length}):`);
    variants.forEach((v) => {
      logger.info(
        `  - ${v.id}: package=${v.packageContent}, multipleQty=${v.multipleQty}`,
      );
    });

    const sortedVariants = variants.sort(
      (a, b) => (b.multipleQty || 0) - (a.multipleQty || 0),
    );
    const highestMultiple = sortedVariants[0].multipleQty || 1;
    const lowestMultiple =
      sortedVariants[sortedVariants.length - 1].multipleQty || 1;

    logger.info("");
    logger.info(`Highest multipleQty: ${highestMultiple}`);
    logger.info(`Lowest multipleQty: ${lowestMultiple}`);
    logger.info("");

    // Test Case 1: High quantity (should select highest package)
    logger.info("=== TEST CASE 1: High Quantity ===");
    const highQuantity = highestMultiple + 5;
    logger.info(`Quantity: ${highQuantity} (>= ${highestMultiple})`);

    const selectedVariantHigh = db.selectPackageVariant(
      testArticleName,
      highQuantity,
    );
    logger.info(`Selected variant: ${selectedVariantHigh?.id}`);
    logger.info(
      `Package content: ${selectedVariantHigh?.packageContent} (multipleQty: ${selectedVariantHigh?.multipleQty})`,
    );

    if (selectedVariantHigh?.id !== sortedVariants[0].id) {
      throw new Error(
        `FAIL: Expected ${sortedVariants[0].id}, got ${selectedVariantHigh?.id}`,
      );
    }
    logger.info("✅ PASS: Highest package selected correctly");
    logger.info("");

    // Test Case 2: Low quantity (should select lowest package)
    logger.info("=== TEST CASE 2: Low Quantity ===");
    const lowQuantity = Math.max(1, highestMultiple - 1);
    logger.info(`Quantity: ${lowQuantity} (< ${highestMultiple})`);

    const selectedVariantLow = db.selectPackageVariant(
      testArticleName,
      lowQuantity,
    );
    logger.info(`Selected variant: ${selectedVariantLow?.id}`);
    logger.info(
      `Package content: ${selectedVariantLow?.packageContent} (multipleQty: ${selectedVariantLow?.multipleQty})`,
    );

    if (
      selectedVariantLow?.id !== sortedVariants[sortedVariants.length - 1].id
    ) {
      throw new Error(
        `FAIL: Expected ${sortedVariants[sortedVariants.length - 1].id}, got ${selectedVariantLow?.id}`,
      );
    }
    logger.info("✅ PASS: Lowest package selected correctly");
    logger.info("");

    // Test Case 3: Threshold quantity (should select highest package)
    logger.info("=== TEST CASE 3: Threshold Quantity ===");
    const thresholdQuantity = highestMultiple;
    logger.info(`Quantity: ${thresholdQuantity} (= ${highestMultiple})`);

    const selectedVariantThreshold = db.selectPackageVariant(
      testArticleName,
      thresholdQuantity,
    );
    logger.info(`Selected variant: ${selectedVariantThreshold?.id}`);
    logger.info(
      `Package content: ${selectedVariantThreshold?.packageContent} (multipleQty: ${selectedVariantThreshold?.multipleQty})`,
    );

    if (selectedVariantThreshold?.id !== sortedVariants[0].id) {
      throw new Error(
        `FAIL: Expected ${sortedVariants[0].id}, got ${selectedVariantThreshold?.id}`,
      );
    }
    logger.info("✅ PASS: Highest package selected at threshold");
    logger.info("");

    logger.info("=== Database Selection Tests: ALL PASSED ===");
    logger.info("");

    // Prompt for real order creation test
    logger.info("=== OPTIONAL: Create Real Order Test ===");
    logger.info(
      "To test with real Archibald, uncomment the order creation code below",
    );
    logger.info("and run this script again with TEST_CREATE_ORDER=true");
    logger.info("");

    if (process.env.TEST_CREATE_ORDER === "true") {
      logger.info("Initializing browser and logging in...");
      await bot.initialize();
      await bot.login();

      const orderData: OrderData = {
        customerId: "",
        customerName: "Fresis Soc Cooperativa", // Replace with valid customer
        items: [
          {
            articleCode: testArticleName,
            quantity: lowQuantity,
            description: "",
            price: 0,
          },
        ],
      };

      logger.info("Creating test order with low quantity...");
      const orderId = await bot.createOrder(orderData);
      logger.info(`✅ Order created: ${orderId}`);
      logger.info("Verify in Archibald that the correct package was selected!");

      await bot.close();
    } else {
      logger.info(
        "Skipping real order creation. Set TEST_CREATE_ORDER=true to enable.",
      );
    }

    logger.info("");
    logger.info("=== Test Complete ===");
  } catch (error) {
    logger.error("Test failed:", error);
    await bot.close();
    process.exit(1);
  }
}

main();

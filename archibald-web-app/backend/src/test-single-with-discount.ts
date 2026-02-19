/**
 * Single article order test with 20% discount
 * Tests:
 * - Single article order
 * - Discount application (20%)
 * - Session cache (should reuse login from previous test)
 *
 * Usage: DEBUG_SCREENSHOTS=true npx tsx src/test-single-with-discount.ts
 */

import { ArchibaldBot } from "./bot/archibald-bot";
import { ProductDatabase } from "./product-db";
import { logger } from "./logger";
import type { OrderData } from "./types";

async function main() {
  const bot = new ArchibaldBot();
  const db = ProductDatabase.getInstance();

  try {
    logger.info("");
    logger.info("========================================");
    logger.info("  SINGLE ARTICLE WITH 20% DISCOUNT TEST");
    logger.info("========================================");
    logger.info("");

    // Find test article with multiple packages
    const allProducts = db.getProducts();
    const articleGroups: Record<string, typeof allProducts> = {};
    allProducts.forEach((p) => {
      if (!articleGroups[p.name]) articleGroups[p.name] = [];
      articleGroups[p.name].push(p);
    });

    const multiVariants = Object.entries(articleGroups).filter(
      ([_, products]) => products.length > 1,
    );

    if (multiVariants.length === 0) {
      logger.error("No multi-package articles found. Run product sync first.");
      process.exit(1);
    }

    const [testArticleName, variants] = multiVariants[0];
    const sortedVariants = variants.sort(
      (a, b) => (b.multipleQty || 0) - (a.multipleQty || 0),
    );
    const lowestMultiple =
      sortedVariants[sortedVariants.length - 1].multipleQty || 1;
    const testQuantity = 3; // Low quantity to test smallest package

    logger.info("Test Configuration:");
    logger.info(`  Article: ${testArticleName}`);
    logger.info(`  Quantity: ${testQuantity}`);
    logger.info(`  Expected Package: ${lowestMultiple} (smallest)`);
    logger.info(`  Discount: 20%`);
    logger.info("");

    logger.info("📌 Step 1: Initializing browser...");
    await bot.initialize();
    logger.info("✅ Browser initialized");
    logger.info("");

    logger.info("📌 Step 2: Logging in (or restoring from cache)...");
    await bot.login();
    logger.info("✅ Login completed");
    logger.info("");

    logger.info("📌 Step 3: Creating order with discount...");
    logger.info("");

    const orderData: OrderData = {
      customerId: "",
      customerName: "Fresis Soc Cooperativa",
      items: [
        {
          articleCode: testArticleName,
          quantity: testQuantity,
          description: `Test with ${testQuantity} units and 20% discount`,
          price: 0,
          discount: 20, // 20% discount
        },
      ],
    };

    logger.info("Order Configuration:");
    logger.info(`  Customer: ${orderData.customerName}`);
    logger.info(`  Article: ${testArticleName}`);
    logger.info(`  Quantity: ${testQuantity}`);
    logger.info(`  Discount: 20%`);
    logger.info("");

    const selectedVariant = db.selectPackageVariant(
      testArticleName,
      testQuantity,
    );
    logger.info("Expected Package Selection:");
    logger.info(`  Variant: ${selectedVariant?.id}`);
    logger.info(`  Package Content: ${selectedVariant?.packageContent}`);
    logger.info("");

    logger.info("Creating order with PASTE method (fast)...");
    logger.info("");

    const startTime = Date.now();
    const orderId = await bot.createOrder(orderData);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    logger.info("");
    logger.info("========================================");
    logger.info("  ORDER CREATION COMPLETED");
    logger.info("========================================");
    logger.info("");
    logger.info(`✅ Order ID: ${orderId}`);
    logger.info(`⏱️  Duration: ${duration}s`);
    logger.info("");
    logger.info("📸 Screenshots saved in logs/ directory");
    logger.info("");

    logger.info("========================================");
    logger.info("  MANUAL VERIFICATION REQUIRED");
    logger.info("========================================");
    logger.info("");
    logger.info("Please verify in Archibald:");
    logger.info(`  1. Order ${orderId} exists`);
    logger.info(`  2. Customer: ${orderData.customerName}`);
    logger.info(`  3. Article: ${testArticleName}`);
    logger.info(`  4. Quantity: ${testQuantity}`);
    logger.info(
      `  5. Package: ${lowestMultiple} (variant ${selectedVariant?.id})`,
    );
    logger.info(`  6. ⚠️  DISCOUNT: 20% applied correctly`);
    logger.info("");

    await bot.close();
    logger.info("✅ Test complete!");
  } catch (error) {
    logger.error("❌ Test failed:", error);
    logger.error("");
    logger.error(
      "Check logs/ directory for debug screenshots to identify the issue.",
    );
    await bot.close();
    process.exit(1);
  }
}

main();
